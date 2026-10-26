import { Storage } from './storage.js?v=8';

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
   * 在目前裝置註冊綁定 iPhone Face ID / Touch ID (iOS 通行密鑰 Passkey)
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
        residentKey: 'required',
        requireResidentKey: true
      },
      timeout: 60000,
      attestation: 'none'
    };

    const credential = await navigator.credentials.create({ publicKey });
    if (!credential || !credential.rawId) {
      throw new Error('未完成 Face ID 綁定');
    }

    const credentialId = bufferToBase64Url(credential.rawId);
    const settings = Storage.getSettings();
    Storage.saveSettings({
      gasUrl: settings.gasUrl || Storage.getDefaultGasUrl(),
      passcode: settings.passcode || 'WC-Family-2026',
      faceIdEnabled: true,
      faceIdCredentialId: credentialId
    });

    sessionStorage.setItem('wc_fas_unlocked', 'true');
    return credentialId;
  },

  /**
   * 喚起 iPhone Face ID / iOS 通行密鑰 (Passkey) 驗證解鎖
   * 支援跨 Chrome 與「iPhone 加入主畫面 (PWA)」直接讀取已存在 iOS 通行密鑰中的金鑰並自動完成配對！
   */
  async verifyFaceId() {
    const settings = Storage.getSettings();
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
        // 允許探索 iOS 系統級 Resident Passkey
      }
    }

    try {
      const assertion = await navigator.credentials.get({ publicKey });
      if (assertion) {
        const credId = bufferToBase64Url(assertion.rawId);
        Storage.saveSettings({
          gasUrl: settings.gasUrl || Storage.getDefaultGasUrl(),
          passcode: settings.passcode || 'WC-Family-2026',
          faceIdEnabled: true,
          faceIdCredentialId: credId
        });
        sessionStorage.setItem('wc_fas_unlocked', 'true');
        return true;
      }
    } catch (err) {
      // 若指定 allowCredentials 失敗，改以無限制探索模式讀取 iOS 通行密鑰 (Passkey)
      if (publicKey.allowCredentials) {
        delete publicKey.allowCredentials;
        const fallbackAssertion = await navigator.credentials.get({ publicKey });
        if (fallbackAssertion) {
          const newCredId = bufferToBase64Url(fallbackAssertion.rawId);
          Storage.saveSettings({
            gasUrl: settings.gasUrl || Storage.getDefaultGasUrl(),
            passcode: settings.passcode || 'WC-Family-2026',
            faceIdEnabled: true,
            faceIdCredentialId: newCredId
          });
          sessionStorage.setItem('wc_fas_unlocked', 'true');
          return true;
        }
      }
      throw err;
    }
    return false;
  },

  /**
   * 使用家庭通行碼或 iOS 儲存的密碼解鎖
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
   * 嚴格門禁檢查：在公開網址或無痕模式下，永遠必須通過 Face ID (iOS 通行密鑰) 或家庭通行碼驗證才可進入
   */
  isSessionUnlocked() {
    const settings = Storage.getSettings();
    if (isLocalHost && !settings.faceIdEnabled) {
      return true;
    }
    if (!settings.gasUrl) {
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
