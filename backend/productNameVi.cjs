'use strict';

const PROMO_PATTERNS = [
  /【[^】]*(?:P\d+倍|ポイント|送料無料|送料込|メール便|あす楽|セール|SALE|特価|まとめ買い|お買い得|訳あり|在庫あり|即納)[^】]*】/gi,
  /(?:管理栄養士推奨|栄養士推奨|おすすめ|ランキング\d*位|人気|売れ筋|大容量|メガ盛り|業務用)/gi,
  /\[[^\]]*(?:sale|free shipping|from japan|ship|official|set of|pack of)[^\]]*\]/gi,
  /\([^)]*(?:from japan|free shipping|official|ship from|seller|import)[^)]*\)/gi,
  /\b(?:from japan|made in japan|japan import)\b/gi,
];

const DIRECT_TRANSLATIONS = [
  {
    test: /(?:揚げとうもろこし|とうもろこし|コーン|corn|おつまみ|スナック菓子|お菓子)/i,
    build: (name, specs) => {
      const details = [];
      if (/揚げとうもろこし/i.test(name)) details.push('bắp chiên');
      else if (/とうもろこし|コーン|corn/i.test(name)) details.push('bắp');
      if (/おつまみ/i.test(name)) details.push('đồ nhắm');
      if (/個包装/i.test(name)) details.push('gói nhỏ');
      if (/沖縄.*塩|塩/i.test(name)) details.push('vị muối');
      if (/サクサク|カリカリ/i.test(name)) details.push('giòn');
      return compactParts([...details, specs.primary]).join(' ');
    },
  },
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
  [/ロート製薬/g, 'Rohto'],
  [/ライオン/g, 'Lion'],
  [/ユニ・チャーム|ユニチャーム/g, 'Unicharm'],
  [/大王製紙/g, 'Daio Paper'],
  [/サントリー/g, 'Suntory'],
  [/カルビー/g, 'Calbee'],
  [/森永/g, 'Morinaga'],
  [/明治/g, 'Meiji'],
  [/江崎グリコ|グリコ/g, 'Glico'],
  [/薬用/g, 'dược dụng'],
  [/医薬部外品/g, 'dược mỹ phẩm'],
  [/医薬品/g, 'thuốc'],
  [/第[一二三1-3]類/g, ''],
  [/ベビー/g, 'em bé'],
  [/ワセリン/g, 'Vaseline'],
  [/保湿/g, 'dưỡng ẩm'],
  [/乾燥肌/g, 'da khô'],
  [/無添加/g, 'không phụ gia'],
  [/無香料/g, 'không mùi'],
  [/無着色/g, 'không màu'],
  [/パラベンフリー/g, 'không paraben'],
  [/クリーム/g, 'kem'],
  [/ジェル/g, 'gel'],
  [/ローション/g, 'lotion'],
  [/オイル/g, 'dầu'],
  [/シャンプー/g, 'dầu gội'],
  [/リンス|コンディショナー/g, 'dầu xả'],
  [/ボディソープ/g, 'sữa tắm'],
  [/ハンドソープ/g, 'nước rửa tay'],
  [/洗顔/g, 'sữa rửa mặt'],
  [/化粧水/g, 'nước dưỡng'],
  [/乳液/g, 'sữa dưỡng'],
  [/美容液/g, 'serum'],
  [/日焼け止め/g, 'kem chống nắng'],
  [/リップ/g, 'son dưỡng môi'],
  [/目薬/g, 'thuốc nhỏ mắt'],
  [/のど飴/g, 'kẹo ngậm họng'],
  [/キャンディ|飴/g, 'kẹo'],
  [/グミ/g, 'kẹo dẻo'],
  [/チョコレート|チョコ/g, 'sô cô la'],
  [/クッキー/g, 'bánh quy'],
  [/ビスケット/g, 'bánh biscuit'],
  [/せんべい|煎餅/g, 'bánh gạo'],
  [/スナック/g, 'snack'],
  [/お菓子/g, 'bánh kẹo'],
  [/おつまみ/g, 'đồ nhắm'],
  [/個包装/g, 'gói nhỏ'],
  [/とうもろこし|トウモロコシ/g, 'bắp'],
  [/コーン/g, 'bắp'],
  [/揚げ/g, 'chiên'],
  [/塩/g, 'muối'],
  [/沖縄/g, 'Okinawa'],
  [/梅/g, 'mận'],
  [/抹茶/g, 'matcha'],
  [/はちみつ|蜂蜜/g, 'mật ong'],
  [/レモン/g, 'chanh'],
  [/ミント/g, 'bạc hà'],
  [/醤油/g, 'nước tương'],
  [/味噌|みそ/g, 'miso'],
  [/ラーメン/g, 'ramen'],
  [/うどん/g, 'udon'],
  [/そば/g, 'soba'],
  [/ふりかけ/g, 'gia vị rắc cơm'],
  [/海苔|のり/g, 'rong biển'],
  [/米/g, 'gạo'],
  [/ソース/g, 'sốt'],
  [/ドレッシング/g, 'nước sốt salad'],
  [/調味料/g, 'gia vị'],
  [/粉末/g, 'dạng bột'],
  [/顆粒/g, 'dạng hạt'],
  [/サプリメント|サプリ/g, 'thực phẩm bổ sung'],
  [/ビタミン/g, 'vitamin'],
  [/カルシウム/g, 'canxi'],
  [/鉄分/g, 'sắt'],
  [/プロテイン/g, 'protein'],
  [/マスク/g, 'khẩu trang'],
  [/洗剤/g, 'nước giặt'],
  [/柔軟剤/g, 'nước xả vải'],
  [/消臭/g, 'khử mùi'],
  [/芳香剤/g, 'sáp thơm'],
  [/入浴剤/g, 'muối tắm'],
  [/冷却/g, 'làm mát'],
  [/温熱/g, 'làm ấm'],
  [/カイロ/g, 'miếng dán giữ nhiệt'],
  [/虫よけ|虫除け/g, 'chống côn trùng'],
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
  [/送料無料/g, ''],
  [/メール便/g, ''],
  [/返品不可/g, ''],
  [/取り寄せ商品/g, 'hàng đặt'],
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
