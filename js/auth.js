import { Storage } from './storage.js?v=13';

let isVerifyingNow = false;

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

  async registerFaceId(memberName = 'Willie') {
    const supported = await this.isBiometricAvailable();
    if (!supported) {
      throw new Error('此裝置或瀏覽器目前不支援 Face ID（請在 HTTPS 環境使用 Safari / Chrome）');
    }

    const userId = new TextEncoder().encode(`wc-family-${memberName}`);
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
   * 單次、絲滑喚起 iPhone Face ID：
   * 1. 防重入鎖 (isVerifyingNow) 避免重複彈出兩個通行密鑰視窗
   * 2. 一旦綁定過 credentialId，自動帶入 allowCredentials 直接刷臉、不再跳出帳號選單
   */
  async verifyFaceId() {
    if (isVerifyingNow) return false;
    isVerifyingNow = true;

    try {
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
        } catch {}
      }

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
      return false;
    } finally {
      isVerifyingNow = false;
    }
  },

  async verifyFallbackPasscode(inputCode) {
    const ok = await Storage.unlockVaultWithPasscode(inputCode);
    if (ok) {
      sessionStorage.setItem('wc_fas_unlocked', 'true');
      return true;
    }
    return false;
  },

  isSessionUnlocked() {
    const settings = Storage.getSettings();
    if (isLocalHost && !settings.faceIdEnabled) {
      return true;
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
