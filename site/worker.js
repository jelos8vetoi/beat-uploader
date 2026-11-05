// Публичные страницы Beat Uploader, которые Google требует для рабочего режима проекта.
const STYLE = `
  :root { color-scheme: light dark; }
  body { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; font: 16px/1.6 system-ui, "Segoe UI", sans-serif; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  h2 { font-size: 19px; margin: 28px 0 6px; }
  a { color: inherit; }
  nav { margin-bottom: 28px; }
  .muted { opacity: .7; font-size: 14px; }
`;

const page = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
<nav><a href="/">Home</a> · <a href="/privacy">Privacy Policy</a></nav>
${body}
</body>
</html>`;

const HOME = page('Beat Uploader', `
<h1>Beat Uploader</h1>
<p>Beat Uploader is a personal Windows desktop app that helps a music producer publish their own beats to their own YouTube channel.</p>
<p>It builds a video from a beat and a picture, prepares the title, description and tags, and uploads the video through the official YouTube Data API. It can also create playlists, add captions, post a first comment, and show channel statistics and comments.</p>
<p>The app uses YouTube API Services. See the <a href="/privacy">Privacy Policy</a>.</p>
`);

const PRIVACY = page('Privacy Policy - Beat Uploader', `
<h1>Privacy Policy</h1>
<p class="muted">Last updated: November 5, 2026</p>

<p>Beat Uploader is a desktop app that runs on your own Windows computer. It has no server and no user accounts of its own, and the developer does not receive your data.</p>

<h2>YouTube API Services</h2>
<p>The app uses YouTube API Services. By using it you agree to the <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>. Your data is also subject to the <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.</p>

<h2>What the app accesses</h2>
<p>After you sign in with Google and grant access, the app can, on your request:</p>
<ul>
  <li>upload videos, thumbnails and captions to your channel;</li>
  <li>create playlists and add your videos to them;</li>
  <li>post comments and replies from your channel;</li>
  <li>read your channel and video statistics and the comments on your videos.</li>
</ul>

<h2>Where your data is stored</h2>
<p>Settings, drafts, and the access token issued by Google are stored only on your computer. The token is encrypted with Windows data protection. The app never sees your Google password.</p>

<h2>Who receives data</h2>
<p>Video files and related information go directly from your computer to Google through the YouTube Data API. To suggest tags and pictures, the app sends the artist names and search words you enter to prozavr.ru, rapidtags.io, bing.com and pinterest.com. Nothing is sent to the developer, and nothing is sold or shared with anyone else.</p>

<h2>Google user data</h2>
<p>The app's use of information received from Google APIs follows the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>

<h2>Removing access and data</h2>
<p>You can remove access at any time in your <a href="https://myaccount.google.com/permissions">Google Account permissions</a> or with the Disconnect button in the app. Uninstalling the app does not remove its local data folder, <code>%APPDATA%\\beat-uploader</code>. Delete that folder to remove all stored data.</p>

<h2>Contact</h2>
<p>Use the support email shown on the Google sign-in consent screen for this app.</p>
`);

export default {
  fetch(request) {
    const { pathname } = new URL(request.url);
    const html = pathname === '/' ? HOME : pathname === '/privacy' ? PRIVACY : null;
    return new Response(html || page('Not found', '<h1>Page not found</h1>'), {
      status: html ? 200 : 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
};
