// 公式資料で確認した表示名の辞書。出典・確認範囲は planning/card-vocabulary.md。
// ゲームのルールは適用せず、カード面の配置だけに使う。
export const normalizeTerm = value => String(value).normalize('NFKC').toLowerCase().replace(/[\s・･_.：:()（）[\]【】/-]/g, '');
const words = values => values.map(normalizeTerm);
const GAME_NAMES = [
  ['pokemon', ['ポケモン', 'ポケカ', 'pokemon', 'pokémon']],
  ['magic', ['マジックザギャザリング', 'MTG', 'magic']],
  ['yugioh', ['遊戯王', 'yugioh', 'yu-gi-oh']],
  ['onepiece', ['ワンピース', 'ワンピカ', 'one piece']],
  ['duelmasters', ['デュエルマスターズ', 'デュエマ', 'duel masters']],
  ['digimon', ['デジモン', 'デジカ', 'digimon']],
  ['battlespirits', ['バトルスピリッツ', 'バトスピ', 'battle spirits']],
  ['vanguard', ['ヴァンガード', 'vanguard']],
  ['weiss', ['ヴァイスシュヴァルツ', 'ヴァイス', 'weiss schwarz', 'weiß schwarz']],
  ['unionarena', ['ユニオンアリーナ', 'ユニアリ', 'union arena']],
  ['evolve', ['シャドウバース', 'シャドバ', 'shadowverse']],
  ['wixoss', ['ウィクロス', 'wixoss']],
  ['lorcana', ['ロルカナ', 'lorcana']],
  ['fab', ['フレッシュアンドブラッド', 'flesh and blood', 'FaB']],
  ['gundam', ['ガンダム', 'gundam']],
  ['fftcg', ['FFTCG', 'FF-TCG', 'ファイナルファンタジー', 'final fantasy']],
  ['fow', ['Force of Will', 'フォースオブウィル', 'FoW']],
];
export function inferCardGame(name = '') {
  const normalized = normalizeTerm(name);
  return GAME_NAMES.find(([, aliases]) => aliases.some(alias => /^[a-z]{2,3}$/i.test(alias)
    ? new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`, 'i').test(name)
    : normalized.includes(normalizeTerm(alias))))?.[0];
}
export const CARD_VOCABULARY = {
  name: words(['カード名', '名称', '名前', 'card name', 'name']),
  color: words(['色', 'カラー', '色属性', '属性色', 'カードの色', 'インクカラー', 'インクの色', 'color', 'colour', 'card color', 'ink color', 'ink type', 'color strip']),
  attribute: words(['属性', '文明', 'エレメント', 'attribute', 'element', 'civilization', '庭']),
  typeColor: words(['タイプ', 'ポケモンのタイプ', 'エネルギータイプ', 'type', 'pokemon type', 'energy type']),
  cost: words(['コスト', 'マナコスト', '消費コスト', '召喚コスト', '登場コスト', '使用コスト', 'プレイコスト', 'インクコスト', 'cost', 'mana cost', 'play cost', 'ink cost', 'casting cost']),
  secondaryCost: words(['進化コスト', 'グロウコスト', '必要エナジー', '消費AP', '必要エネルギー', 'ワザに必要なエネルギー', 'エナジーコスト', 'エネルギーコスト', '必要マナ', '消費', 'マナ', 'エナジー', 'エネルギー', 'energy cost', 'required energy', 'action point cost', 'digivolution cost', 'evolution cost', 'grow cost', 'mana', 'energy']),
  power: words(['パワー', '力', '攻撃力', '攻撃', '戦闘力', '打点', '強さ', 'BP', 'バトルポイント', 'バトルパワー', 'DP', 'デジモンパワー', 'AP', 'ATK', 'power', 'attack', 'attack power', 'attack points', 'strength', 'battle power', 'digimon power', 'パワー／タフネス', 'power/toughness', 'ATK/DEF']),
  durability: words(['HP', 'ヒットポイント', '体力', '耐久', '耐久力', '意志力', '意思力', 'タフネス', '守備力', '防御力', 'DEF', 'シールド', 'health', 'hit points', 'life', 'willpower', 'toughness', 'defense', 'defence', 'shield']),
  text: words(['テキスト', 'カードテキスト', '本文', '説明', '効果', '効果テキスト', '能力', '特殊能力', 'スキル', '特性', 'ワザ', 'ワザの効果', '進化元効果', 'セキュリティ効果', 'トリガー効果', 'ペンデュラム効果', 'フレーバー', 'フレーバーテキスト', 'text', 'card text', 'rules text', 'effect', 'effects', 'ability', 'abilities', 'skill', 'inherited effect', 'security effect', 'trigger effect', 'flavor text', 'flavour text']),
};

// 公式の色・属性名と、一般的な表記揺れ。配色自体はこのアプリ独自のもの。
const COLOR_GROUPS = [
  [['赤', '赤色', '紅', '火', '炎', '燈火の庭', 'red', 'fire', 'ruby', 'ルビー'], ['#783f38', '#ead2bf']],
  [['青', '青色', '蒼', '水', '氷', '海', 'blue', 'water', 'ice', 'sapphire', 'サファイア'], ['#305768', '#c9dfe5']],
  [['緑', '緑色', '翠', '森', '木', '風', '草', '自然', '翠芽の庭', 'green', 'forest', 'wind', 'grass', 'nature', 'emerald', 'エメラルド'], ['#365c48', '#d6e1c6']],
  [['黄', '黄色', '金', '光', '雷', '琥珀の庭', 'yellow', 'gold', 'light', 'lightning', 'electric', 'amber', 'アンバー', 'ドラゴン', 'dragon', '神', 'divine'], ['#78602d', '#eee1b8']],
  [['紫', '紫色', '闇', '毒', '超', 'purple', 'darkness', 'dark', 'psychic', 'amethyst', 'アメジスト'], ['#59465f', '#e0d3e3']],
  [['黒', '黒色', '影', '悪', 'black'], ['#3a414b', '#cdd1d8']],
  [['白', '白色', '月', '無', '無色', 'ゼロ', '月白の庭', 'white', 'colorless', 'colourless', 'neutral'], ['#596570', '#e7e6dd']],
  [['鋼', '金属', '銀', 'steel', 'metal', 'スティール'], ['#485a60', '#d9dfe0']],
  [['土', '地', '闘', 'earth', 'fighting'], ['#725037', '#e2d2bd']],
  [['妖', 'フェアリー', 'fairy', '桃', 'ピンク', 'pink'], ['#78536b', '#eddae6']],
];
const colors = new Map(COLOR_GROUPS.flatMap(([terms, palette]) => terms.map(term => [normalizeTerm(term), palette])));
export const NEUTRAL_PALETTE = ['#505e64', '#e1ded3'];
export function palettesFor(value, gameName = '') {
  const game = inferCardGame(gameName);
  const tokens = String(value).normalize('NFKC').split(/[・･/／,、+＆&\s]+/).filter(Boolean);
  const found = tokens.map(token => {
    let term = normalizeTerm(token).replace(/(文明|属性|タイプ|色)$/, '');
    if (game === 'magic') term = ({ w: '白', u: '青', b: '黒', r: '赤', g: '緑', c: '無色' })[term] || term;
    if (game === 'duelmasters' && term === '闇') term = '黒';
    return colors.get(term) || colors.get(normalizeTerm(token));
  }).filter(Boolean);
  return [...new Set(found)];
}

function matches(label, role) {
  const normalized = normalizeTerm(label);
  if (CARD_VOCABULARY[role].includes(normalized)) return 2;
  // 「攻撃力（ATK）」等の説明付き表記。短い英字は語境界なしで部分一致させない。
  const parts = String(label).normalize('NFKC').split(/[\s()（）[\]【】：:]+/).map(normalizeTerm);
  return parts.some(part => CARD_VOCABULARY[role].includes(part)) ? 1 : 0;
}
export const isTextField = field => !!matches(field.label, 'text');

export function selectArtworkField(fields, role, gameName = '') {
  const game = inferCardGame(gameName);
  const groups = ({ name: ['name'], color: ['color', 'attribute', 'typeColor'], cost: ['cost', 'secondaryCost'], power: ['power', 'durability'] })[role];
  const candidates = fields.filter(field => {
    if (!field.value) return false;
    if (role === 'cost' && /軽減|削減|reduction|discount/i.test(field.label)) return false;
    const term = normalizeTerm(field.label);
    if (game === 'unionarena' && role === 'power' && term === 'ap') return false;
    if (game === 'duelmasters' && role === 'cost' && ['マナ', 'mana'].includes(term)) return false;
    return true;
  });
  for (const group of groups) {
    for (const quality of [2, 1]) {
      const found = candidates.find(field => matches(field.label, group) === quality && (role !== 'color' || palettesFor(field.value, gameName).length));
      if (found) return found;
    }
  }
  if (game === 'unionarena' && role === 'cost') return candidates.find(field => normalizeTerm(field.label) === 'ap');
  // 独自表示名の補助。消費APを攻撃力AP、意志力をpowerへ誤分類しない。
  const fallback = { cost: /コスト|消費|必要.*(?:マナ|エナジー|エネルギー)/, power: /攻撃力|戦闘力|パワー/, name: /^カード.*名$/ }[role];
  if (fallback) return candidates.find(field => fallback.test(field.label));
}
