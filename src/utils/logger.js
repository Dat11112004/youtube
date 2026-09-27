/**
 * YouTube Ad-Shield Pro - Logger Utility
 * Quản lý logging với định dạng chuẩn [YT-ADBLOCK] theo yêu cầu
 */

const AdShieldLogger = (function () {
  const PREFIX = '[YT-ADBLOCK]';

  return {
    log(message, ...details) {
      if (details.length > 0) {
        console.log(`${PREFIX} ${message}`, ...details);
      } else {
        console.log(`${PREFIX} ${message}`);
      }
    },
    info(message, ...details) {
      if (details.length > 0) {
        console.info(`${PREFIX} ${message}`, ...details);
      } else {
        console.info(`${PREFIX} ${message}`);
      }
    },
    warn(message, ...details) {
      if (details.length > 0) {
        console.warn(`${PREFIX} ${message}`, ...details);
      } else {
        console.warn(`${PREFIX} ${message}`);
      }
    },
    error(message, ...details) {
      if (details.length > 0) {
        console.error(`${PREFIX} ${message}`, ...details);
      } else {
        console.error(`${PREFIX} ${message}`);
      }
    }
  };
})();

if (typeof window !== 'undefined') {
  window.AdShieldLogger = AdShieldLogger;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdShieldLogger;
}
