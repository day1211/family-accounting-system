import { Storage } from './storage.js?v=6';

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBuffer(base64url) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

function randomChallenge(size = 32) {
  const arr = new Uint8Array(size);
  window.crypto.getRandomValues(arr);
  return arr;
}

const isLocalHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.'));

export const Auth = {
  async isBiometricAvailable() {
    if (
      typeof window === 'undefined' ||
      !window.PublicKeyCredential ||
      !navigator.credentials
    ) {
      return false;
    }
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  },

  /**
   * 在目前裝置註冊綁定 iPhone Face ID / Touch ID (WebAuthn Passkey)
   */
  async registerFaceId(memberName = 'Willie') {
    const supported = await this.isBiometricAvailable();
    if (!supported) {
      throw new Error('此裝置或瀏覽器目前不支援 Face ID（請在 HTTPS 環境使用 Safari / Chrome）');
    }

    const userId = new TextEncoder().encode(`wc-family-${memberName}-${Date.now()}`);
    const publicKey = {
      challenge: randomChallenge(32),
      rp: {
        name: 'W&C 家庭記帳本'
      },
      user: {
        id: userId,
        name: `${memberName}@wc-family-ledger`,
        displayName: `${memberName} (W&C 家庭記帳)`
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 }
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred'
      },
      timeout: 60000,
      attestation: 'none'
    };

    const credential = await navigator.credentials.create({ publicKey });
    if (!credential || !credential.rawId) {
      throw new Error('未完成 Face ID 綁定');
    }

    const credentialId = bufferToBase64Url(credential.rawId);
    Storage.saveSettings({
      faceIdEnabled: true,
      faceIdCredentialId: credentialId
    });

    sessionStorage.setItem('wc_fas_unlocked', 'true');
    return credentialId;
  },

  /**
   * 喚起 iPhone Face ID 驗證解鎖
   * 資安防護：若處於無痕模式或尚未配對過家庭通行碼，禁止直接跳過驗證！
   */
  async verifyFaceId() {
    const settings = Storage.getSettings();

    // 若此瀏覽器尚未配對雲端金鑰（例如無痕視窗或陌生人的手機），必須先驗證家庭通行碼
    if (!settings.gasUrl || !settings.passcode) {
      throw new Error('UNPAIRED_DEVICE');
    }

    // 若已配對過家庭通行碼，但尚未在此手機綁定 Face ID，點擊按鈕可直接完成首次 Face ID 綁定與解鎖
    if (!settings.faceIdEnabled || !settings.faceIdCredentialId) {
      await this.registerFaceId(settings.defaultMember || 'Willie');
      return true;
    }

    const publicKey = {
      challenge: randomChallenge(32),
      userVerification: 'required',
      timeout: 60000
    };

    if (settings.faceIdCredentialId) {
      try {
        publicKey.allowCredentials = [
          {
            id: base64UrlToBuffer(settings.faceIdCredentialId),
            type: 'public-key',
            transports: ['internal', 'hybrid']
          }
        ];
      } catch {
        // 允許探索 Resident Passkey
      }
    }

    try {
      const assertion = await navigator.credentials.get({ publicKey });
      if (assertion) {
        sessionStorage.setItem('wc_fas_unlocked', 'true');
        return true;
      }
    } catch (err) {
      if (publicKey.allowCredentials) {
        delete publicKey.allowCredentials;
        const fallbackAssertion = await navigator.credentials.get({ publicKey });
        if (fallbackAssertion) {
          const newCredId = bufferToBase64Url(fallbackAssertion.rawId);
          Storage.saveSettings({ faceIdCredentialId: newCredId });
          sessionStorage.setItem('wc_fas_unlocked', 'true');
          return true;
        }
      }
      throw err;
    }
    return false;
  },

  /**
   * 使用家庭通行碼解鎖（並自動透過 AES-256-GCM 解密雲端連線端點）
   */
  async verifyFallbackPasscode(inputCode) {
    const ok = await Storage.unlockVaultWithPasscode(inputCode);
    if (ok) {
      sessionStorage.setItem('wc_fas_unlocked', 'true');
      return true;
    }
    return false;
  },

  /**
   * 嚴格門禁檢查：
   * 在公開網址 (GitHub Pages) 或無痕模式下，永遠必須通過 Face ID 或家庭通行碼驗證才可進入！
   */
  isSessionUnlocked() {
    const settings = Storage.getSettings();
    if (isLocalHost && !settings.faceIdEnabled) {
      return true;
    }
    if (!settings.gasUrl || !settings.passcode) {
      return false;
    }
    return sessionStorage.getItem('wc_fas_unlocked') === 'true';
  },

  markSessionUnlocked() {
    sessionStorage.setItem('wc_fas_unlocked', 'true');
  },

  lockSession() {
    sessionStorage.removeItem('wc_fas_unlocked');
  },

  disableFaceId() {
    Storage.saveSettings({
      faceIdEnabled: false,
      faceIdCredentialId: ''
    });
  }
};
