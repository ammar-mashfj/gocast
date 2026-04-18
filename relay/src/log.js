/**
 * Structured JSON logger for production observability.
 * @param {"info"|"warn"|"error"} level
 * @param {string} msg
 * @param {Object} [data]
 */
function log(level, msg, data = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...data,
  };
  console.log(JSON.stringify(entry));
}

module.exports = log;
