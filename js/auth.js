import { Storage } from './storage.js?v=4';

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
   * 支援 iCloud 鑰匙圈同步，換新 iPhone 同 Apple ID 可自動繼承或一鍵重綁
   */
  async registerFaceId(memberName = 'Willie') {
    const supported = await this.isBiometricAvailable();
    if (!supported) {
      throw new Error('此裝置或瀏覽器目前不支援 Face ID / 生物辨識（需在 HTTPS 或 localhost 環境下使用 Safari / Chrome）');
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
        { type: 'public-key', alg: -7 },   // ES256 (iOS Secure Enclave / Face ID 標準演算法)
        { type: 'public-key', alg: -257 }  // RS256
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
        // 若跨手機透過 iCloud 鑰匙圈同步，允許探索 Resident Passkey
      }
    }

    try {
      const assertion = await navigator.credentials.get({ publicKey });
      if (assertion) {
        sessionStorage.setItem('wc_fas_unlocked', 'true');
        return true;
      }
    } catch (err) {
      // 如果因換新手機且舊 Credential ID 不匹配，嘗試不指定 allowCredentials 喚起 iCloud Passkey
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
   * 使用家庭通行碼或備援 PIN 解鎖（換機或無法使用 Face ID 時的備援）
   */
  verifyFallbackPasscode(inputCode) {
    const settings = Storage.getSettings();
    const clean = (inputCode || '').trim();
    if (!clean) return false;

    if (
      (settings.lockPin && clean === settings.lockPin) ||
      (settings.passcode && clean === settings.passcode)
    ) {
      sessionStorage.setItem('wc_fas_unlocked', 'true');
      return true;
    }
    return false;
  },

  isSessionUnlocked() {
    const settings = Storage.getSettings();
    if (!settings.faceIdEnabled) return true;
    return sessionStorage.getItem('wc_fas_unlocked') === 'true';
  },

  lockSession() {
    sessionStorage.removeItem('wc_fas_unlocked');
  },

  disableFaceId() {
    Storage.saveSettings({
      faceIdEnabled: false,
      faceIdCredentialId: ''
    });
    sessionStorage.setItem('wc_fas_unlocked', 'true');
  }
};
