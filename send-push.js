const webpush = require('web-push');

// 必要な環境変数
const GAS_URL = process.env.GAS_URL;
const PUSH_SECRET = process.env.PUSH_SECRET;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (!GAS_URL || !PUSH_SECRET || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('Error: Missing required environment variables (GAS_URL, PUSH_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)');
  process.exit(1);
}

// web-push の VAPID 認証設定
webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

async function run() {
  console.log(`[${new Date().toISOString()}] Fetching pending push notification jobs from GAS...`);

  // 1. GAS から pending ジョブを取得
  const fetchUrl = `${GAS_URL}${GAS_URL.includes('?') ? '&' : '?'}action=get_pending_push_jobs&secret=${encodeURIComponent(PUSH_SECRET)}`;
  
  let response;
  try {
    const res = await fetch(fetchUrl);
    response = await res.json();
  } catch (err) {
    console.error('Failed to contact GAS endpoint:', err);
    process.exit(1);
  }

  if (response.status !== 'success') {
    console.error('GAS returned error:', response.message || response);
    process.exit(1);
  }

  const jobs = response.jobs || [];
  console.log(`Found ${jobs.length} pending job(s).`);

  if (jobs.length === 0) {
    console.log('No pending jobs. Exiting.');
    return;
  }

  const reportResults = [];
  const invalidEndpoints = new Set();

  // 2. 各ジョブのメッセージを web-push で送信
  for (const job of jobs) {
    console.log(`Processing Job [${job.jobId}] - Test: "${job.testName}" (${job.timingType}) - Target messages: ${job.messages.length}`);
    
    let successCount = 0;
    let failCount = 0;

    for (const msg of job.messages) {
      const sub = msg.subscription;
      const payloadStr = JSON.stringify(msg.payload);

      try {
        await webpush.sendNotification(sub, payloadStr);
        successCount++;
      } catch (err) {
        failCount++;
        const statusCode = err.statusCode;
        console.warn(`Failed to send to ${msg.studentKey} (Status ${statusCode}):`, err.message);

        // 404 Not Found または 410 Gone の場合、端末側で通知が無効化または失効
        if (statusCode === 404 || statusCode === 410) {
          invalidEndpoints.add(sub.endpoint);
        }
      }
    }

    console.log(`Job [${job.jobId}] finished. Success: ${successCount}, Fail: ${failCount}`);

    reportResults.push({
      jobId: job.jobId,
      testId: job.testId,
      testName: job.testName,
      timingType: job.timingType,
      targetCount: job.messages.length,
      successCount: successCount,
      failCount: failCount,
      note: `GitHub Actions executed. Success: ${successCount}, Fail: ${failCount}`
    });
  }

  // 3. 送信結果および失効トークンを GAS へ報告
  console.log('Reporting execution results back to GAS...');
  try {
    const reportRes = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'report_push_results',
        secret: PUSH_SECRET,
        results: reportResults,
        invalidEndpoints: Array.from(invalidEndpoints)
      })
    });
    const reportData = await reportRes.json();
    console.log('Report response from GAS:', reportData);
  } catch (err) {
    console.error('Failed to report results to GAS:', err);
  }

  console.log('All jobs completed successfully.');
}

run().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
