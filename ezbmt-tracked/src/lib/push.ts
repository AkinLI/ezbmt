export async function initPushIfAvailable() {
  try {
    // 動態載入，沒裝也不會拋錯
    const messaging = require('@react-native-firebase/messaging').default;

    // 申請權限（iOS 會彈窗；Android 自動允許）
    try {
      await messaging().requestPermission();
    } catch {}

    // 取得 token 並註冊到後端
    let token: string | null = null;
    try {
      token = await messaging().getToken();
    } catch {
      token = null;
    }
    if (token) {
      try {
        const { registerDeviceToken } = require('../db');
        await registerDeviceToken(token);
      } catch {}
    }

    // token 變更時重新註冊
    try {
      messaging().onTokenRefresh(async (tok: string) => {
        try {
          const { registerDeviceToken } = require('../db');
          await registerDeviceToken(tok);
        } catch {}
      });
    } catch {}
  } catch {
    // 未安裝 @react-native-firebase/messaging 或環境不支援，略過即可
  }
}