const initSqlJs = require('sql.js');
console.log('initSqlJs type', typeof initSqlJs);
console.dir(initSqlJs, { depth: 1 });
initSqlJs().then(SQL => {
  console.log('sql.js initialized, SQL.Database exists:', !!SQL.Database);
}).catch(err => console.error('init err', err && err.message));
