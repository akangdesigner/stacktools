import Database from 'better-sqlite3';
import path from 'path';

// 建新 job
const db = new Database(path.join(process.cwd(), 'data', 'social.db'));
const jobId = crypto.randomUUID();
const clientId = 'cbf422c6-a379-4015-a16d-82840df889aa';
db.prepare('INSERT INTO social_jobs (id, client_id, status) VALUES (?, ?, ?)').run(jobId, clientId, 'processing');
db.close();
console.log('Job created:', jobId);

// code 格式（文檔新格式）
const payload = {
  jobId,
  status: 'completed',
  posts: [
    {
      貼文擁有者: 'relove_care',
      大頭照: 'https://instagram.fnjf37-1.fna.fbcdn.net/v/t51.82787-19/525564752_17916250908118225_1070870049694005815_n.jpg?stp=dst-jpg_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby41MDAuYzIifQ&_nc_ht=instagram.fnjf37-1.fna.fbcdn.net&_nc_cat=101&oh=00_Af2w40Qjo4wzs1cUmCIj5NJ-wYX56dE4dDfrMADOguS4JQ&oe=69E78E55',
      頻道來源: 'Threads',
      '第一篇貼文的code': 'DXMBcIujwQa',
      '第二篇貼文的code': 'DWlNbo_lANh',
      '第三篇貼文的code': 'DWlNcHPlAbk',
      '第四篇貼文的code': 'DWi1kjClAda',
      '第五篇貼文的code': 'DWX6oKOCOf_',
    },
  ],
};

const res = await fetch('http://localhost:3001/api/social-webhook/callback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const text = await res.text();
console.log('status:', res.status, '| body:', text);

// 確認存進去的資料
const db2 = new Database(path.join(process.cwd(), 'data', 'social.db'));
const posts = db2.prepare('SELECT id, platform, account, content, thumbnail, video_url, post_url FROM social_posts WHERE job_id = ?').all(jobId);
console.log('\n存入 DB：');
posts.forEach(p => console.log(p));
db2.close();
