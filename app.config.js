// Extends app.json. WEB_BASE_URL is set only when building the website for
// GitHub Pages (served from /Book-Dragon-Liar/); the Android app ignores it.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.WEB_BASE_URL ? { baseUrl: process.env.WEB_BASE_URL } : {}),
  },
});
