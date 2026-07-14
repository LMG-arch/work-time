// 上班日历账号密码哈希计算 / 后端密码重置辅助
//
// 背景：账号密码在客户端做 SHA-256(password + ':' + salt) 哈希后，
// 仅把哈希通过 register_username/login_username RPC 上传到 Supabase，
// 服务端 profiles.password_hash 只存哈希，不存明文，也无法反推明文。
// 注意：salt 是「设备本地」存储键 social-account-salt，并不在数据库里，
// 登录时客户端用本地 salt 重新算哈希做比对。
//
// 用法：
//   node scripts/reset-password.js <用户名> <新密码> [盐值]
//   - 不传盐值：自动生成新盐，并提示还需在登录设备上写入该盐
//   - 传盐值  ：用该盐计算哈希（沿用设备已有盐时，登录才会成功）
//
// 输出：① SQL UPDATE 语句 ② 若生成新盐，需同步到设备的本地盐值

const crypto = require('crypto');

const [, , username, password, saltArg] = process.argv;
if (!username || !password) {
  console.error('用法: node scripts/reset-password.js <用户名> <新密码> [盐值]');
  process.exit(1);
}

const salt = saltArg || crypto.randomBytes(16).toString('hex');
const hash = crypto.createHash('sha256').update(password + ':' + salt).digest('hex');

console.log('用户名     :', username);
console.log('盐值(salt) :', salt);
console.log('哈希(hash) :', hash);
console.log('');
console.log('-- 在 Supabase Dashboard > SQL Editor 执行 --');
console.log(`UPDATE profiles SET password_hash = '${hash}' WHERE username = '${username}' AND deleted_at IS NULL;`);

if (!saltArg) {
  console.log('');
  console.log('⚠️ 使用了「新盐值」，登录设备上还需把本地键 social-account-salt 设为上面这个盐：');
  console.log(`   web / 桌面端浏览器控制台: window.__storage.setRaw('social-account-salt', '${salt}');`);
  console.log('   安卓端: 需与设备持久化层一致（见下方说明）。');
}
