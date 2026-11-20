// Sample set order. User-created sets follow Japanese natural order.
export const PACK_OPTIONS = Object.freeze(['SG01 翠芽の庭','SG02 燈火の庭','SG03 琥珀の庭','SG04 月白の庭']);
// Only the bundled sets use a code prefix. User folder names keep spaces intact.
export const packKey = pack => {
  const name = String(pack ?? '');
  return PACK_OPTIONS.includes(name) ? name.split(' ')[0] : name;
};
export const packTitle = pack => PACK_OPTIONS.includes(pack) ? pack.slice(pack.indexOf(' ') + 1) : String(pack ?? '');
const ranks = new Map(PACK_OPTIONS.flatMap((pack, index) => [[pack, index], [packKey(pack), index]]));
const collator = new Intl.Collator('ja', { numeric: true });
export const packRank = pack => ranks.get(pack) ?? PACK_OPTIONS.length;
export const comparePacks = (a, b) => packRank(a) - packRank(b) || collator.compare(a, b);
// One physical card belongs to the front set, with the back as fallback.
export const cardPack = card => card.isDoubleSided ? card.front?.pack || card.back?.pack || card.pack || '' : card.pack || '';
