/* Google 雲端硬碟備份設定（可公開，不含密鑰）。
   部署到 GitHub Pages 前，把 googleClientId 改成你的 OAuth 用戶端 ID。
   也可在 App「設定 → 備份」暫時填在裝置上（存在本機 IndexedDB）。
   測試／預先注入時：若頁面已有非空的 googleClientId，這裡不會覆蓋。 */
(function (g) {
  const prev = g.MISTAKE_BACKUP_CONFIG || {};
  g.MISTAKE_BACKUP_CONFIG = {
    googleClientId: (prev.googleClientId || '').trim() || '461183935358-2a92jrhteleava41ie7s93pf4elg9m8u.apps.googleusercontent.com'
  };
})(typeof window !== 'undefined' ? window : globalThis);
