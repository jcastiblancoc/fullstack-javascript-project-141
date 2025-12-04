let rollbar = null;

export const initRollbar = async () => {
  const token = process.env.ROLLBAR_ACCESS_TOKEN;
  if (!token) return null;
  try {
    // load rollbar dynamically so app can run even if not installed
    // eslint-disable-next-line import/no-unresolved
    const mod = await import('rollbar');
    const Rollbar = mod.default || mod;
    rollbar = new Rollbar({
      accessToken: token,
      environment: process.env.NODE_ENV || 'development',
      captureUncaught: true,
      captureUnhandledRejections: true,
    });
    return rollbar;
  } catch (err) {
    // If rollbar package not installed, don't fail app; log a warning
    // eslint-disable-next-line no-console
    console.warn('Rollbar package not installed or failed to load. Error reporting disabled.', err && err.message ? err.message : err);
    return null;
  }
};

export const getRollbar = () => rollbar;

export default { initRollbar, getRollbar };
