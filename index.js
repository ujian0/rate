const { Telegraf, Markup, session } = require('telegraf');
const crypto = require('crypto');

// ==========================
// Konfigurasi Dasar
// ==========================
const BOT_TOKEN = '7524016177:AAGf7cK0-YlG3n2S3qR6IaUIGIWMg6qgMgU';
const PUBLIC_CHANNEL_ID = '-1002857800900';
const ADMIN_ID = 6468926488;
const PAP_COOLDOWN_MS = 10 * 60 * 1000;
const TOKEN_VALID_MS = 24 * 60 * 60 * 1000;

if (!BOT_TOKEN) {
  throw new Error('❌ BOT_TOKEN tidak ditemukan!');
}

const bot = new Telegraf(BOT_TOKEN);
bot.use(session({ defaultSession: () => ({}) }));

// ==========================
// Penyimpanan Sementara
// ==========================
const userPapCooldown = new Map();
const blockedUsers = new Set();
const mediaStore = new Map();

// ==========================
// Fungsi Utilitas
// ==========================
function generateToken(length = 4) {
  return crypto.randomBytes(length).toString('hex');
}

function getUserDisplay(user) {
  if (!user) return 'Tanpa Nama';
  if (user.username) return `@${user.username}`;
  return `[${user.first_name}](tg://user?id=${user.id})`;
}

async function sendSafeMessage(userId, message, extra = {}) {
  try {
    await bot.telegram.sendMessage(userId, message, extra);
  } catch (err) {
    if (err.code === 403) {
      console.warn(`❌ User ${userId} memblokir bot.`);
      blockedUsers.add(userId);
    } else {
      console.error(`❌ Gagal kirim ke ${userId}:`, err.description || err.message);
    }
  }
}

async function safeEditMessageText(ctx, text, extra = {}) {
  try {
    const msg = ctx.update?.callback_query?.message;
    if (!msg) return;

    const sameText = msg.text === text;
    const sameMarkup = JSON.stringify(msg.reply_markup) === JSON.stringify(extra.reply_markup);

    if (!sameText || !sameMarkup) {
      await ctx.editMessageText(text, extra);
    }
  } catch (err) {
    console.error('Edit error:', err.description || err.message);
  }
}

async function showMainMenu(ctx) {
  const text = 'Selamat datang! Pilih opsi:';
  const markup = Markup.inlineKeyboard([
    [Markup.button.callback('📊 Rate Pap', 'RATE_PAP')],
    [Markup.button.callback('📸 Kirim Pap', 'KIRIM_PAP')],
    [Markup.button.callback('📨 Menfes', 'MENFES')],
    [Markup.button.url('🎥 Beli Video Premium', 'https://t.me/vvip_3_bot')],
  ]);

  if (ctx.updateType === 'callback_query') {
    await ctx.answerCbQuery().catch(() => {});
    await safeEditMessageText(ctx, text, { reply_markup: markup.reply_markup });
  } else {
    await ctx.reply(text, { reply_markup: markup.reply_markup });
  }
}

// ==========================
// Handler Start
// ==========================
bot.start(async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  await showMainMenu(ctx);
});

bot.action('BACK_TO_MENU', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await showMainMenu(ctx);
});

// ==========================
// SISA HANDLER TETAP SAMA
// (copy bagian bawah dari kode kamu sebelumnya)
// ==========================
// 📸 KIRIM PAP
// 📊 RATE PAP
// 📨 MENFES
// /report
// /help
// (TIDAK PERLU DIULANGI DI SINI — tidak ada yang rusak di bagian itu)

// ==========================
// Error Handling Global
// ==========================
bot.catch((err, ctx) => {
  console.error('❗ Bot Error:', err);
  ctx.reply?.('🚨 Terjadi kesalahan pada bot. Silakan coba lagi nanti.').catch(() => {});
});

// ==========================
// Menjalankan Bot
// ==========================
bot.launch()
  .then(() => {
    console.log('✅ Bot berhasil dijalankan!');
  })
  .catch((err) => {
    console.error('❌ Gagal menjalankan bot:', err);
  });

// ==========================
// Graceful Shutdown (wajib untuk Zeabur atau Docker)
// ==========================
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
