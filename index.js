const { Telegraf, Markup, session } = require('telegraf');
const crypto = require('crypto');

// Konstanta dan penyimpanan data
const BOT_TOKEN = '7524016177:AAGf7cK0-YlG3n2S3qR6IaUIGIWMg6qgMgU';
const PUBLIC_CHANNEL_ID = '-1002857800900';
const ADMIN_ID = 6468926488;
const PAP_COOLDOWN_MS = 10 * 60 * 1000;
const TOKEN_VALID_MS = 24 * 60 * 60 * 1000;

const bot = new Telegraf(BOT_TOKEN);
bot.use(session({ defaultSession: () => ({}) }));

const userPapCooldown = new Map();
const blockedUsers = new Set();
const mediaStore = new Map();

// Utility Functions
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

// Start Command
bot.start(async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  await showMainMenu(ctx);
});

bot.action('BACK_TO_MENU', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await showMainMenu(ctx);
});


// ------------------
// 📸 KIRIM PAP
// ------------------

bot.action('KIRIM_PAP', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const text = 'Ingin kirim pap sebagai?';
  const markup = Markup.inlineKeyboard([
    [Markup.button.callback('🙈 Anonim', 'KIRIM_ANON')],
    [Markup.button.callback('🪪 Identitas', 'KIRIM_ID')],
    [Markup.button.callback('🔙 Kembali', 'BACK_TO_MENU')],
  ]);
  await safeEditMessageText(ctx, text, { reply_markup: markup.reply_markup });
});

bot.action('KIRIM_ANON', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  ctx.session.kirimPap = { mode: 'Anonim', status: 'menunggu_media' };
  await safeEditMessageText(ctx, '✅ Kamu kirim sebagai: *Anonim*\nSekarang kirim media-nya.', { parse_mode: 'Markdown' });
});

bot.action('KIRIM_ID', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const username = getUserDisplay(ctx.from);
  ctx.session.kirimPap = { mode: username, status: 'menunggu_media' };
  await safeEditMessageText(ctx, `✅ Kamu kirim sebagai: *${username}*\nSekarang kirim media-nya.`, { parse_mode: 'Markdown' });
});

bot.on(['photo', 'video', 'document'], async (ctx) => {
  const sess = ctx.session.kirimPap;
  const now = Date.now();
  const last = userPapCooldown.get(ctx.from.id) || 0;

  if (now - last < PAP_COOLDOWN_MS) {
    const sisa = Math.ceil((PAP_COOLDOWN_MS - (now - last)) / 60000);
    return ctx.reply(`⏳ Tunggu ${sisa} menit lagi sebelum kirim lagi.`).then(() => showMainMenu(ctx));
  }

  if (!sess || sess.status !== 'menunggu_media') {
    return ctx.reply('⚠️ Pilih dulu menu "📸 Kirim Pap".').then(() => showMainMenu(ctx));
  }

  let file = null, fileType = '';
  if (ctx.message.photo) {
    file = ctx.message.photo.pop();
    fileType = 'photo';
  } else if (ctx.message.video) {
    file = ctx.message.video;
    fileType = 'video';
  } else if (ctx.message.document) {
    file = ctx.message.document;
    fileType = 'document';
  }

  if (!file?.file_id) return ctx.reply('❌ Gagal baca file. Coba lagi.').then(() => showMainMenu(ctx));

  const token = generateToken();
  sess.token = token;
  sess.status = 'selesai';

  mediaStore.set(token, {
    fileId: file.file_id,
    fileType,
    mode: sess.mode,
    from: ctx.from.id,
    caption: ctx.message.caption || '',
    createdAt: now,
  });

  userPapCooldown.set(ctx.from.id, now);

  await ctx.reply('✅ Media diterima! Token sudah dikirim ke admin.');

  await sendSafeMessage(ADMIN_ID,
    `📥 Pap baru\n👤 Dari: ${getUserDisplay(ctx.from)}\n🔐 Token: \`${token}\``,
    { parse_mode: 'Markdown' }
  );

  await sendSafeMessage(PUBLIC_CHANNEL_ID,
    `📸 Pap baru masuk!\n🔐 Token: <code>${token}</code>\n📝 Kirim token ini ke bot`,
    { parse_mode: 'HTML' }
  );

  await showMainMenu(ctx);
});


// ------------------
// 📊 RATE PAP
// ------------------

bot.action('RATE_PAP', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  ctx.session.rating = { stage: 'menunggu_token' };
  await safeEditMessageText(ctx, '🔢 Masukkan token pap yang ingin kamu nilai:', {
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'BACK_TO_MENU')]]).reply_markup
  });
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  // Help Command
  if (text.toLowerCase() === '/help') {
    await ctx.reply(`🤖 *Bantuan*\n\n📸 /start - Mulai bot\n📩 /help - Lihat bantuan\n📊 Rate Pap - Nilai\n📸 Kirim Pap - Kirim media\n📨 Menfes - Pesan anonim`, { parse_mode: 'Markdown' });
    return showMainMenu(ctx);
  }

  // Menfes
  if (ctx.session.menfes?.status === 'menunggu_pesan') {
    const pesan = text;
    const mode = ctx.session.menfes.mode;
    ctx.session.menfes = null;

    const markup = (mode && mode !== 'Anonim')
      ? Markup.inlineKeyboard([
          [Markup.button.url('🔗 Kirim Pesan', mode.startsWith('@') ? `https://t.me/${mode.slice(1)}` : `tg://user?id=${ctx.from.id}`)]
        ])
      : null;

    const fullMsg = `📨 Menfes dari ${mode}:\n\n${pesan}`;
    const realIdentity = `\n\n👤 Dari user: ${getUserDisplay(ctx.from)}`;

    await sendSafeMessage(PUBLIC_CHANNEL_ID, fullMsg, {
      parse_mode: 'Markdown',
      reply_markup: markup?.reply_markup,
    });

    await sendSafeMessage(ADMIN_ID, fullMsg + realIdentity, {
      parse_mode: 'Markdown',
      reply_markup: markup?.reply_markup,
    });

    await ctx.reply('✅ Menfes kamu sudah dikirim!');
    return showMainMenu(ctx);
  }

  // Token Rating
  const rating = ctx.session.rating;
  if (rating?.stage === 'menunggu_token') {
    const data = mediaStore.get(text);
    if (!data) {
      await ctx.reply('❌ Token tidak valid atau sudah kedaluwarsa.');
      return showMainMenu(ctx);
    }

    if (Date.now() - data.createdAt > TOKEN_VALID_MS) {
      mediaStore.delete(text);
      await ctx.reply('⏳ Token ini sudah kedaluwarsa.');
      return showMainMenu(ctx);
    }

    if (ctx.from.id === data.from) {
      await ctx.reply('⚠️ Kamu tidak bisa menilai pap sendiri.');
      return showMainMenu(ctx);
    }

    ctx.session.rating = { stage: 'menunggu_rating', token: text, from: data.from };

    const caption = `📸 Pap oleh: *${data.mode}*${data.caption ? `\n📝 ${data.caption}` : ''}`;
    const mediaOptions = { caption, parse_mode: 'Markdown', protect_content: true };

    if (data.fileType === 'photo') {
      await ctx.replyWithPhoto(data.fileId, mediaOptions);
    } else if (data.fileType === 'video') {
      await ctx.replyWithVideo(data.fileId, mediaOptions);
    } else {
      await ctx.replyWithDocument(data.fileId, mediaOptions);
    }

    return ctx.reply('📝 Pilih rating (1–5):', Markup.inlineKeyboard([
      [1, 2, 3, 4, 5].map(n => Markup.button.callback(`${n}`, `RATE_${n}`))
    ]));
  }

  if (rating?.stage === 'menunggu_rating') {
    return ctx.reply('⚠️ Pilih rating dengan tombol di bawah.');
  }
});

bot.action(/^RATE_(\d)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const val = parseInt(ctx.match[1]);
  const data = ctx.session.rating;

  if (!data || data.stage !== 'menunggu_rating') {
    await ctx.reply('⚠️ Tidak ada sesi rating aktif.');
    return showMainMenu(ctx);
  }

  ctx.session.rating = null;
  await ctx.reply(`✅ Terima kasih! Kamu memberi rating ${val}/5`);

  await sendSafeMessage(data.from, `📸 Foto anda telah diberi rating: *${val}/5*`, { parse_mode: 'Markdown' });
  await showMainMenu(ctx);
});


// ------------------
// 📨 MENFES
// ------------------

bot.action('MENFES', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  ctx.session.menfes = { mode: null, status: 'menunggu_pesan' };
  const markup = Markup.inlineKeyboard([
    [Markup.button.callback('🙈 Anonim', 'MENFES_ANON')],
    [Markup.button.callback('🪪 Identitas', 'MENFES_ID')],
    [Markup.button.callback('🔙 Kembali', 'BACK_TO_MENU')],
  ]);
  await safeEditMessageText(ctx, 'Ingin kirim menfes sebagai?', { reply_markup: markup.reply_markup });
});

bot.action('MENFES_ANON', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  ctx.session.menfes = { mode: 'Anonim', status: 'menunggu_pesan' };
  await safeEditMessageText(ctx, '✅ Kirim sebagai Anonim. Sekarang ketik pesanmu.', { parse_mode: 'Markdown' });
});

bot.action('MENFES_ID', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const username = getUserDisplay(ctx.from);
  ctx.session.menfes = { mode: username, status: 'menunggu_pesan' };
  await safeEditMessageText(ctx, `✅ Kirim sebagai *${username}*. Sekarang ketik pesanmu.`, { parse_mode: 'Markdown' });
});


// ------------------
// 🛑 REPORT
// ------------------

bot.command('report', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const token = args[0];

  if (!token) {
    await ctx.reply('⚠️ Gunakan: /report <token>');
    return showMainMenu(ctx);
  }

  await sendSafeMessage(ADMIN_ID, `🚨 Laporan! Token: \`${token}\` dilaporkan oleh ${getUserDisplay(ctx.from)}`, { parse_mode: 'Markdown' });
  await ctx.reply('✅ Laporan dikirim ke admin.');
  await showMainMenu(ctx);
});


// ------------------
// ❓ HELP
// ------------------

bot.action('HELP', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const helpText = `🤖 *Bantuan Bot*\n
📸 /start - Mulai ulang bot
📩 /help - Tampilkan bantuan
📊 Rate Pap - Nilai pap orang lain
📸 Kirim Pap - Kirim media
📨 Menfes - Kirim pesan anonim
🔙 Kembali ke menu utama kapan saja dengan tombol yang tersedia.
  `;
  await safeEditMessageText(ctx, helpText, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Kembali', 'BACK_TO_MENU')]
    ]).reply_markup
  });
});


// Jalankan Bot
bot.launch();
console.log('Bot started!');
