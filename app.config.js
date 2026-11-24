// Wraps app.json. EXPO_BASE_URL is set only for GitHub Pages (e.g. /salepro-by-monte); leave it empty on a own domain.
module.exports = ({ config }) => {
  const baseUrl = (process.env.EXPO_BASE_URL || '').replace(/\/+$/, '');
  return { ...config, experiments: { ...config.experiments, ...(baseUrl ? { baseUrl } : {}) } };
};
