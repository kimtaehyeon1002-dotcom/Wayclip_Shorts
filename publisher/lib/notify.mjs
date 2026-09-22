import nodemailer from 'nodemailer';

const USER = process.env.GMAIL_USER;
const PASS = process.env.GMAIL_APP_PASSWORD;
const TO = process.env.NOTIFY_TO || USER;

// Gmail SMTP 로 메일 발송. 자격증명 없으면 콘솔에만 남기고 넘어감(파이프라인 안 끊김).
export async function sendMail(subject, text) {
  if (!USER || !PASS) { console.log(`[메일 생략: GMAIL_APP_PASSWORD 미설정] ${subject}`); return; }
  try {
    const tx = nodemailer.createTransport({ service: 'gmail', auth: { user: USER, pass: PASS } });
    await tx.sendMail({ from: `Shorts Publisher <${USER}>`, to: TO, subject, text });
    console.log(`[메일 발송] ${subject} → ${TO}`);
  } catch (e) {
    console.log(`[메일 실패] ${e.message}`);
  }
}
