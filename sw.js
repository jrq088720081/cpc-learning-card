// 錯題本 service worker：讓 App 不用網路也能打開
const CACHE = 'mistake-notebook-v23';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './learn-features.js',
  './gate.js',
  './data/math/figures/jingxin/p7-q1.png',
  './data/math/figures/jingxin/p7-q2.png',
  './data/math/figures/jingxin/p7-q3.png',
  './data/math/figures/jingxin/p7-q8.png',
  './backup-config.js',
  './drive-backup.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './data/chinese/knowledge.json',
  './data/chinese/knowledge-data.js',
  './data/chinese/meta.json',
  './data/chinese/rare-chars.json',
  './data/chinese/rare-chars-data.js',
  './data/chinese/rare-chars.md',
  './data/exam/bank.json',
  './data/exam/bank-data.js',
  './data/exam/concepts.json',
  './data/exam/concepts-data.js',
  './data/zh/quiz.json',
  './data/zh/quiz-data.js',
  './data/en/quiz.json',
  './data/en/quiz-data.js',
  './data/math/lessons.json',
  './data/math/lessons-data.js',
  './data/math/exam-links.json',
  './data/math/exam-links-data.js',
  './data/tips/tips.json',
  './data/tips/tips-data.js',
  './vendor/katex/katex.min.css',
  './vendor/katex/katex.min.js',
  './vendor/katex/auto-render.min.js',
  './vendor/katex/fonts/KaTeX_Main-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Main-Bold.woff2',
  './vendor/katex/fonts/KaTeX_Main-Italic.woff2',
  './vendor/katex/fonts/KaTeX_Math-Italic.woff2',
  './vendor/katex/fonts/KaTeX_Size1-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size2-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size3-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size4-Regular.woff2',
  './vendor/katex/fonts/KaTeX_AMS-Regular.woff2',
  './data/exam/figures/104/q07.png',
  './data/exam/figures/104/q08.png',
  './data/exam/figures/104/q09.png',
  './data/exam/figures/104/q12.png',
  './data/exam/figures/104/q16.png',
  './data/exam/figures/104/q42.png',
  './data/exam/figures/104/q43.png',
  './data/exam/figures/104/q46.png',
  './data/exam/figures/104/q48.png',
  './data/exam/figures/104/q49.png',
  './data/exam/figures/104/q51.png',
  './data/exam/figures/104/q53.png',
  './data/exam/figures/105/q05.png',
  './data/exam/figures/105/q15.png',
  './data/exam/figures/105/q16.png',
  './data/exam/figures/105/q19.png',
  './data/exam/figures/105/q42.png',
  './data/exam/figures/105/q43.png',
  './data/exam/figures/105/q45.png',
  './data/exam/figures/105/q50.png',
  './data/exam/figures/106/q06.png',
  './data/exam/figures/106/q07.png',
  './data/exam/figures/106/q08.png',
  './data/exam/figures/106/q09.png',
  './data/exam/figures/106/q10.png',
  './data/exam/figures/106/q11.png',
  './data/exam/figures/106/q12.png',
  './data/exam/figures/106/q13.png',
  './data/exam/figures/106/q14.png',
  './data/exam/figures/106/q15.png',
  './data/exam/figures/106/q16.png',
  './data/exam/figures/106/q17.png',
  './data/exam/figures/106/q20.png',
  './data/exam/figures/106/q21.png',
  './data/exam/figures/106/q26.png',
  './data/exam/figures/106/q33.png',
  './data/exam/figures/106/q34.png',
  './data/exam/figures/106/q37.png',
  './data/exam/figures/106/q38.png',
  './data/exam/figures/106/q42.png',
  './data/exam/figures/106/q45.png',
  './data/exam/figures/106/q46.png',
  './data/exam/figures/106/q48.png',
  './data/exam/figures/106/q54.png',
  './data/exam/figures/106/q55.png',
  './data/exam/figures/106/q56.png',
  './data/exam/figures/106/q58.png',
  './data/exam/figures/106/q69.png',
  './data/exam/figures/106/q70.png',
  './data/exam/figures/108/q04.png',
  './data/exam/figures/108/q07.png',
  './data/exam/figures/108/q08.png',
  './data/exam/figures/108/q09.png',
  './data/exam/figures/108/q10.png',
  './data/exam/figures/108/q11.png',
  './data/exam/figures/108/q13.png',
  './data/exam/figures/108/q19.png',
  './data/exam/figures/108/q20.png',
  './data/exam/figures/108/q22.png',
  './data/exam/figures/108/q23.png',
  './data/exam/figures/108/q25.png',
  './data/exam/figures/108/q49.png',
  './data/exam/figures/108/q50.png',
  './data/exam/figures/108/q51.png',
  './data/exam/figures/109/q03.png',
  './data/exam/figures/109/q05.png',
  './data/exam/figures/109/q06.png',
  './data/exam/figures/109/q07.png',
  './data/exam/figures/109/q08.png',
  './data/exam/figures/109/q09.png',
  './data/exam/figures/109/q10.png',
  './data/exam/figures/109/q11.png',
  './data/exam/figures/109/q12.png',
  './data/exam/figures/109/q13.png',
  './data/exam/figures/109/q14.png',
  './data/exam/figures/109/q15.png',
  './data/exam/figures/109/q16.png',
  './data/exam/figures/109/q39.png',
  './data/exam/figures/109/q40.png',
  './data/exam/figures/109/q50.png',
  './data/exam/figures/109/q51.png',
  './data/exam/figures/110/q01.png',
  './data/exam/figures/110/q14.png',
  './data/exam/figures/110/q15.png',
  './data/exam/figures/110/q17.png',
  './data/exam/figures/110/q21.png',
  './data/exam/figures/110/q22.png',
  './data/exam/figures/110/q23.png',
  './data/exam/figures/110/q24.png',
  './data/exam/figures/110/q25.png',
  './data/exam/figures/110/q27.png',
  './data/exam/figures/110/q54.png',
  './data/exam/figures/110/q55.png',
  './data/exam/figures/110/q60.png',
  './data/exam/figures/111/q104.png',
  './data/exam/figures/111/q18.png',
  './data/exam/figures/111/q25.png',
  './data/exam/figures/111/q54.png',
  './data/exam/figures/113/q15.png',
  './data/exam/figures/113/q17.png',
  './data/exam/figures/113/q54.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true }) ||
      (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    const network = fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => undefined);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    const res = await network;
    return res || new Response('目前沒有網路，而且這個檔案還沒存到手機上。', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  })());
});
