import db from '../server/src/db/connection.js';
db.prepare("DELETE FROM settings WHERE key='dashboard_password_hash'").run();
console.log('dashboard_password_hash cleared');
