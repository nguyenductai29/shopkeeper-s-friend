'use strict';

const PROMO_PATTERNS = [
  /【[^】]*(?:P\d+倍|ポイント|送料無料|送料込|メール便|あす楽|セール|SALE|特価|まとめ買い|お買い得|訳あり|在庫あり|即納)[^】]*】/gi,
  /\[[^\]]*(?:sale|free shipping|from japan|ship|official|set of|pack of)[^\]]*\]/gi,
  /\([^)]*(?:from japan|free shipping|official|ship from|seller|import)[^)]*\)/gi,
  /\b(?:from japan|made in japan|japan import)\b/gi,
];

const DIRECT_TRANSLATIONS = [
  {
    test: /(?:myfirst\s*fone\s*r1c|myfirstfone\s*r1c|キッズスマートウォッチ|スマートウォッチ)/i,
    build: (name) => {
      const details = [];
      if (/gps/i.test(name)) details.push('GPS');
      if (/4g|lte/i.test(name)) details.push('4G');
      if (/ビデオ|video/i.test(name)) details.push('gọi video');
      if (/grey|gray|グレー/i.test(name)) details.push('màu xám');
      return compactParts(['Đồng hồ trẻ em myFirst Fone R1c', ...details]).join(' ');
    },
  },
  {
    test: /(?:ベビーワセリン|baby\s+vaseline|vaseline\s+baby)/i,
    build: (name, specs) => {
      const details = [];
      if (/保湿|moistur/i.test(name)) details.push('dưỡng ẩm');
      if (/dry\s*skin|乾燥肌/i.test(name)) details.push('da khô');
      if (/paraben\s*free|パラベンフリー/i.test(name)) details.push('không paraben');
      return compactParts(['Vaseline em bé', ...details, specs.primary]).join(' ');
    },
  },
  {
    test: /(?:ウェットティッシュ|wet\s*tissue|wet\s*wipes)/i,
    build: (name, specs) => {
      const details = [];
      if (/除菌|disinfect|sanitize/i.test(name)) details.push('khử khuẩn');
      if (/アルコール|alcohol/i.test(name)) details.push(`cồn${specs.percent ? ` ${specs.percent}` : ''}`);
      if (/極厚|厚手/i.test(name)) details.push('loại dày');
      if (/抗菌/i.test(name)) details.push('kháng khuẩn');
      return compactParts(['Khăn giấy ướt', ...details, specs.count, specs.duration]).join(' ');
    },
  },
  {
    test: /(?:ハミガキ|歯磨き|toothpaste|tooth\s*paste)/i,
    build: (name, specs) => {
      const brand = /ピュオーラ|pyuora/i.test(name) ? 'Pyuora' : null;
      const details = [];
      if (/バリア|barrier/i.test(name)) details.push('Barrier');
      if (/ジェル|gel/i.test(name)) details.push('gel');
      if (/薬用|medicated/i.test(name)) details.push('dược dụng');
      return compactParts([brand, 'kem đánh răng', ...details, specs.primary]).join(' ');
    },
  },
];

const TERM_REPLACEMENTS = [
  [/健栄製薬/g, 'Kenei'],
  [/花王/g, 'Kao'],
  [/資生堂/g, 'Shiseido'],
  [/小林製薬/g, 'Kobayashi'],
  [/薬用/g, 'dược dụng'],
  [/医薬部外品/g, 'dược mỹ phẩm'],
  [/ベビー/g, 'em bé'],
  [/ワセリン/g, 'Vaseline'],
  [/保湿/g, 'dưỡng ẩm'],
  [/乾燥肌/g, 'da khô'],
  [/無添加/g, 'không phụ gia'],
  [/パラベンフリー/g, 'không paraben'],
  [/クリーム/g, 'kem'],
  [/ジェル/g, 'gel'],
  [/ローション/g, 'lotion'],
  [/シャンプー/g, 'dầu gội'],
  [/リンス|コンディショナー/g, 'dầu xả'],
  [/ボディソープ/g, 'sữa tắm'],
  [/洗顔/g, 'sữa rửa mặt'],
  [/化粧水/g, 'nước dưỡng'],
  [/乳液/g, 'sữa dưỡng'],
  [/日焼け止め/g, 'kem chống nắng'],
  [/目薬/g, 'thuốc nhỏ mắt'],
  [/除菌/g, 'khử khuẩn'],
  [/抗菌/g, 'kháng khuẩn'],
  [/アルコール/g, 'cồn'],
  [/ウェットティッシュ/g, 'khăn giấy ướt'],
  [/ティッシュ/g, 'khăn giấy'],
  [/ボトル/g, 'chai'],
  [/詰替え|詰め替え|詰替/g, 'túi thay thế'],
  [/極厚|厚手/g, 'loại dày'],
  [/ピュオーラ/g, 'Pyuora'],
  [/バリア/g, 'Barrier'],
  [/\bmoisturizing\s+cream\b/gi, 'kem dưỡng ẩm'],
  [/\bmoisturizing\b/gi, 'dưỡng ẩm'],
  [/\bcream\b/gi, 'kem'],
  [/\bbaby\b/gi, 'em bé'],
  [/\bdry\s*skin\b/gi, 'da khô'],
  [/\bparaben\s*free\b/gi, 'không paraben'],
  [/\bmedicated\b/gi, 'dược dụng'],
  [/\btooth\s*paste\b|\btoothpaste\b/gi, 'kem đánh răng'],
  [/\bwet\s*(?:tissue|wipes)\b/gi, 'khăn giấy ướt'],
];

function compactParts(parts) {
  return parts
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, array) => array.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);
}

function normalizeWidth(value) {
  return String(value || '').replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

function cleanSourceName(value) {
  let name = normalizeWidth(value)
    .replace(/×/g, ' x ')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[、，]/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const pattern of PROMO_PATTERNS) {
    name = name.replace(pattern, ' ');
  }

  return name
    .replace(/【|】|\[|\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSpecs(name) {
  const primaryPack = name.match(/(\d+(?:\.\d+)?\s*(?:ml|mL|L|g|kg))\s*(?:x|×)\s*(\d+)/i);
  const primary = name.match(/\d+(?:\.\d+)?\s*(?:ml|mL|L|g|kg|枚|個|本|包|錠|粒)/i)?.[0] || null;
  const percent = name.match(/\d+(?:\.\d+)?\s*%/)?.[0] || null;
  const duration = name.match(/\d+\s*(?:h|時間)/i)?.[0]?.replace(/時間/i, 'h') || null;
  const countRaw = name.match(/\d+\s*枚/)?.[0] || null;
  const count = countRaw ? countRaw.replace(/\s*枚/, ' tờ') : null;
  const primaryWithPack = primaryPack ? `${primaryPack[1]} x ${primaryPack[2]}` : primary;
  return {
    primary: normalizeSpec(primaryWithPack),
    percent,
    duration,
    count,
  };
}

function normalizeSpec(value) {
  if (!value) return null;
  return String(value)
    .replace(/\s+/g, '')
    .replace(/枚/g, ' tờ')
    .replace(/個/g, ' cái')
    .replace(/本/g, ' chai')
    .replace(/包/g, ' gói')
    .replace(/錠|粒/g, ' viên')
    .replace(/x/g, ' x ')
    .trim();
}

function applyDictionary(name) {
  let output = name;
  for (const [pattern, replacement] of TERM_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

function removeLeftoverNoise(value) {
  return String(value || '')
    .replace(/\([^)]*(?:公式|通販|Amazon|楽天|Yahoo|ヨドバシ|ビックカメラ)[^)]*\)/gi, ' ')
    .replace(/\b(?:official|store|online|shop)\b/gi, ' ')
    .replace(/\s*[|｜/]\s*/g, ' ')
    .replace(/\s*[-_]\s*/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseFirst(value) {
  const text = String(value || '').trim();
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shortenName(value, maxLength = 72) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastBreak = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf(','));
  return `${cut.slice(0, lastBreak > 36 ? lastBreak : maxLength).trim()}...`;
}

function localizeProductName(value) {
  const source = cleanSourceName(value);
  if (!source) return null;

  const specs = extractSpecs(source);
  for (const translation of DIRECT_TRANSLATIONS) {
    if (translation.test.test(source)) {
      return shortenName(titleCaseFirst(removeLeftoverNoise(translation.build(source, specs))));
    }
  }

  const translated = removeLeftoverNoise(applyDictionary(source));
  return shortenName(titleCaseFirst(translated));
}

module.exports = {
  localizeProductName,
  cleanSourceName,
};
