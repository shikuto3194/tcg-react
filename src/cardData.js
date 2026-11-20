// Original sample. Regenerate from sample-game/cards.csv with npm run sample:build.
import { applyVersionToCard } from './imageUrl.js';
const cards = [
  {
    "id": 10001,
    "name": "星種を運ぶ仔狐",
    "image": "images/starlit/01.png",
    "cardNumber": "SG01-001",
    "pack": "SG01 翠芽の庭",
    "color": [
      "翠芽の庭"
    ],
    "type": "精霊",
    "rarity": "C",
    "tribe": "獣",
    "cost": 1,
    "reduction": [
      "1"
    ],
    "effect": "登場時：自分の山札の上1枚を見て、上か下に戻す。\n\n小さな一歩が、春を連れてくる。",
    "symbol": []
  },
  {
    "id": 10002,
    "name": "露玉の案内人",
    "image": "images/starlit/02.png",
    "cardNumber": "SG01-002",
    "pack": "SG01 翠芽の庭",
    "color": [
      "翠芽の庭"
    ],
    "type": "精霊",
    "rarity": "C",
    "tribe": "兎人",
    "cost": 2,
    "reduction": [
      "2"
    ],
    "effect": "登場時：自分の眠っている精霊1体を起こす。\n\n朝露は、まだ誰も知らない星の欠片。",
    "symbol": []
  },
  {
    "id": 10003,
    "name": "花冠の鹿",
    "image": "images/starlit/03.png",
    "cardNumber": "SG01-003",
    "pack": "SG01 翠芽の庭",
    "color": [
      "翠芽の庭"
    ],
    "type": "精霊",
    "rarity": "U",
    "tribe": "獣",
    "cost": 3,
    "reduction": [
      "3"
    ],
    "effect": "登場時：自分の捨て札のコスト1の精霊1枚を手札に戻す。\n\n角に咲く花は、失くした道を覚えている。",
    "symbol": []
  },
  {
    "id": 10004,
    "name": "苔むす甲羅の守り手",
    "image": "images/starlit/04.png",
    "cardNumber": "SG01-004",
    "pack": "SG01 翠芽の庭",
    "color": [
      "翠芽の庭"
    ],
    "type": "精霊",
    "rarity": "C",
    "tribe": "獣",
    "cost": 3,
    "reduction": [
      "4"
    ],
    "effect": "効果なし。\n\n急ぐことだけが、進むことではない。",
    "symbol": []
  },
  {
    "id": 10005,
    "name": "梢を渡る風鳥",
    "image": "images/starlit/05.png",
    "cardNumber": "SG01-005",
    "pack": "SG01 翠芽の庭",
    "color": [
      "翠芽の庭"
    ],
    "type": "精霊",
    "rarity": "U",
    "tribe": "鳥",
    "cost": 4,
    "reduction": [
      "3"
    ],
    "effect": "登場時：カードを1枚引く。\n\n羽ばたくたび、枝先に新しい歌が芽吹く。",
    "symbol": []
  },
  {
    "id": 10006,
    "name": "芽吹きの庭姫",
    "image": "images/starlit/06.png",
    "cardNumber": "SG01-006",
    "pack": "SG01 翠芽の庭",
    "color": [
      "翠芽の庭"
    ],
    "type": "精霊",
    "rarity": "R",
    "tribe": "花妖",
    "cost": 5,
    "reduction": [
      "5"
    ],
    "effect": "登場時：自分の捨て札の精霊1枚を手札に戻す。\n\n千の春を見届けても、最初の芽を喜ぶ。",
    "symbol": []
  },
  {
    "id": 10007,
    "name": "やさしい雨",
    "image": "images/starlit/07.png",
    "cardNumber": "SG01-007",
    "pack": "SG01 翠芽の庭",
    "color": [
      "翠芽の庭"
    ],
    "type": "術式",
    "rarity": "C",
    "tribe": "天候",
    "cost": 1,
    "reduction": [
      "—"
    ],
    "effect": "自分の山札の上3枚を見て、好きな順で上に戻す。\n\n雨音が、眠る種の名を呼んだ。",
    "symbol": []
  },
  {
    "id": 10008,
    "name": "再生の花環",
    "image": "images/starlit/08.png",
    "cardNumber": "SG01-008",
    "pack": "SG01 翠芽の庭",
    "color": [
      "翠芽の庭"
    ],
    "type": "術式",
    "rarity": "U",
    "tribe": "祝福",
    "cost": 2,
    "reduction": [
      "—"
    ],
    "effect": "自分の捨て札のコスト2以下の精霊1枚を手札に戻す。\n\n輪になった花には、終わりがない。",
    "symbol": []
  },
  {
    "id": 10009,
    "name": "木漏れ日の道",
    "image": "images/starlit/09.png",
    "cardNumber": "SG01-009",
    "pack": "SG01 翠芽の庭",
    "color": [
      "翠芽の庭"
    ],
    "type": "術式",
    "rarity": "C",
    "tribe": "道",
    "cost": 2,
    "reduction": [
      "—"
    ],
    "effect": "カードを2枚引き、手札を1枚捨てる。\n\n迷い道にも、光は差す。",
    "symbol": []
  },
  {
    "id": 10010,
    "name": "春の星祭り",
    "image": "images/starlit/10.png",
    "cardNumber": "SG01-010",
    "pack": "SG01 翠芽の庭",
    "color": [
      "翠芽の庭"
    ],
    "type": "術式",
    "rarity": "R",
    "tribe": "祭",
    "cost": 5,
    "reduction": [
      "—"
    ],
    "effect": "自分の星灯を2増やす。\n\n庭じゅうの蕾が、同じ夜に灯った。",
    "symbol": []
  },
  {
    "id": 10011,
    "name": "灯芯の猫術師",
    "image": "images/starlit/11.png",
    "cardNumber": "SG02-001",
    "pack": "SG02 燈火の庭",
    "color": [
      "燈火の庭"
    ],
    "type": "精霊",
    "rarity": "C",
    "tribe": "猫人",
    "cost": 1,
    "reduction": [
      "2"
    ],
    "effect": "効果なし。\n\n尻尾の火は、友を温めるためにある。",
    "symbol": []
  },
  {
    "id": 10012,
    "name": "陽だまりの火蜥蜴",
    "image": "images/starlit/12.png",
    "cardNumber": "SG02-002",
    "pack": "SG02 燈火の庭",
    "color": [
      "燈火の庭"
    ],
    "type": "精霊",
    "rarity": "C",
    "tribe": "獣",
    "cost": 2,
    "reduction": [
      "3"
    ],
    "effect": "効果なし。\n\n石畳に残るぬくもりが、彼の足跡。",
    "symbol": []
  },
  {
    "id": 10013,
    "name": "暁羽の隼",
    "image": "images/starlit/13.png",
    "cardNumber": "SG02-003",
    "pack": "SG02 燈火の庭",
    "color": [
      "燈火の庭"
    ],
    "type": "精霊",
    "rarity": "U",
    "tribe": "鳥",
    "cost": 3,
    "reduction": [
      "3"
    ],
    "effect": "登場時：相手の力2以下の精霊1体を眠らせる。\n\n夜明けよりも一拍早く、空へ。",
    "symbol": []
  },
  {
    "id": 10014,
    "name": "琥珀角の牡羊",
    "image": "images/starlit/14.png",
    "cardNumber": "SG02-004",
    "pack": "SG02 燈火の庭",
    "color": [
      "燈火の庭"
    ],
    "type": "精霊",
    "rarity": "C",
    "tribe": "獣",
    "cost": 3,
    "reduction": [
      "4"
    ],
    "effect": "効果なし。\n\nその角には、沈まない夕日が宿る。",
    "symbol": []
  },
  {
    "id": 10015,
    "name": "炉守りの獅子姫",
    "image": "images/starlit/15.png",
    "cardNumber": "SG02-005",
    "pack": "SG02 燈火の庭",
    "color": [
      "燈火の庭"
    ],
    "type": "精霊",
    "rarity": "U",
    "tribe": "獅人",
    "cost": 4,
    "reduction": [
      "4"
    ],
    "effect": "登場時：相手のコスト1の精霊1体を捨て札にする。\n\n荒ぶる火にも、帰る家はある。",
    "symbol": []
  },
  {
    "id": 10016,
    "name": "真昼の不死鳥",
    "image": "images/starlit/16.png",
    "cardNumber": "SG02-006",
    "pack": "SG02 燈火の庭",
    "color": [
      "燈火の庭"
    ],
    "type": "精霊",
    "rarity": "R",
    "tribe": "鳥",
    "cost": 5,
    "reduction": [
      "5"
    ],
    "effect": "登場時：相手の精霊1体を眠らせる。\n\n灰から生まれるのは、明日への願い。",
    "symbol": []
  },
  {
    "id": 10017,
    "name": "ひとすじの火花",
    "image": "images/starlit/17.png",
    "cardNumber": "SG02-007",
    "pack": "SG02 燈火の庭",
    "color": [
      "燈火の庭"
    ],
    "type": "術式",
    "rarity": "C",
    "tribe": "火",
    "cost": 1,
    "reduction": [
      "—"
    ],
    "effect": "相手の力1以下の精霊1体を捨て札にする。\n\n小さくても、闇を分けるには十分。",
    "symbol": []
  },
  {
    "id": 10018,
    "name": "灯籠の招き",
    "image": "images/starlit/18.png",
    "cardNumber": "SG02-008",
    "pack": "SG02 燈火の庭",
    "color": [
      "燈火の庭"
    ],
    "type": "術式",
    "rarity": "C",
    "tribe": "祝福",
    "cost": 2,
    "reduction": [
      "—"
    ],
    "effect": "カードを2枚引き、手札を1枚捨てる。\n\n迷ったら、いちばん温かな灯りへ。",
    "symbol": []
  },
  {
    "id": 10019,
    "name": "朱い流星",
    "image": "images/starlit/19.png",
    "cardNumber": "SG02-009",
    "pack": "SG02 燈火の庭",
    "color": [
      "燈火の庭"
    ],
    "type": "術式",
    "rarity": "U",
    "tribe": "星",
    "cost": 3,
    "reduction": [
      "—"
    ],
    "effect": "相手の力3以下の精霊1体を捨て札にする。\n\n願いは、ためらいを焼いて進む。",
    "symbol": []
  },
  {
    "id": 10020,
    "name": "夏の星祭り",
    "image": "images/starlit/20.png",
    "cardNumber": "SG02-010",
    "pack": "SG02 燈火の庭",
    "color": [
      "燈火の庭"
    ],
    "type": "術式",
    "rarity": "R",
    "tribe": "祭",
    "cost": 5,
    "reduction": [
      "—"
    ],
    "effect": "自分の星灯を2増やす。\n\n太陽が眠っても、庭の歌は終わらない。",
    "symbol": []
  },
  {
    "id": 10021,
    "name": "落葉を編む栗鼠",
    "image": "images/starlit/21.png",
    "cardNumber": "SG03-001",
    "pack": "SG03 琥珀の庭",
    "color": [
      "琥珀の庭"
    ],
    "type": "精霊",
    "rarity": "C",
    "tribe": "獣",
    "cost": 1,
    "reduction": [
      "1"
    ],
    "effect": "登場時：自分の山札の上1枚を見て、上か下に戻す。\n\n冬への贈り物を、今日から少しずつ。",
    "symbol": []
  },
  {
    "id": 10022,
    "name": "銅鈴の梟",
    "image": "images/starlit/22.png",
    "cardNumber": "SG03-002",
    "pack": "SG03 琥珀の庭",
    "color": [
      "琥珀の庭"
    ],
    "type": "精霊",
    "rarity": "C",
    "tribe": "鳥",
    "cost": 2,
    "reduction": [
      "2"
    ],
    "effect": "登場時：自分の山札の上2枚を見て、好きな順で上に戻す。\n\n鈴が鳴るのは、よい知らせのある夜。",
    "symbol": []
  },
  {
    "id": 10023,
    "name": "実りの菓子職人",
    "image": "images/starlit/23.png",
    "cardNumber": "SG03-003",
    "pack": "SG03 琥珀の庭",
    "color": [
      "琥珀の庭"
    ],
    "type": "精霊",
    "rarity": "U",
    "tribe": "獣人",
    "cost": 3,
    "reduction": [
      "3"
    ],
    "effect": "登場時：カードを1枚引き、手札を1枚捨てる。\n\n分け合うほど、籠は豊かになる。",
    "symbol": []
  },
  {
    "id": 10024,
    "name": "夕映えの野牛",
    "image": "images/starlit/24.png",
    "cardNumber": "SG03-004",
    "pack": "SG03 琥珀の庭",
    "color": [
      "琥珀の庭"
    ],
    "type": "精霊",
    "rarity": "C",
    "tribe": "獣",
    "cost": 3,
    "reduction": [
      "4"
    ],
    "effect": "効果なし。\n\n足音が、眠る大地をいたわった。",
    "symbol": []
  },
  {
    "id": 10025,
    "name": "書庫の梟司書",
    "image": "images/starlit/25.png",
    "cardNumber": "SG03-005",
    "pack": "SG03 琥珀の庭",
    "color": [
      "琥珀の庭"
    ],
    "type": "精霊",
    "rarity": "U",
    "tribe": "梟人",
    "cost": 4,
    "reduction": [
      "3"
    ],
    "effect": "登場時：カードを1枚引く。\n\n物語を閉じても、知恵は羽ばたく。",
    "symbol": []
  },
  {
    "id": 10026,
    "name": "黄昏の麒麟",
    "image": "images/starlit/26.png",
    "cardNumber": "SG03-006",
    "pack": "SG03 琥珀の庭",
    "color": [
      "琥珀の庭"
    ],
    "type": "精霊",
    "rarity": "R",
    "tribe": "獣",
    "cost": 5,
    "reduction": [
      "5"
    ],
    "effect": "登場時：自分の捨て札の術式1枚を手札に戻す。\n\n見送る季節を、決して忘れない。",
    "symbol": []
  },
  {
    "id": 10027,
    "name": "拾い集めた記憶",
    "image": "images/starlit/27.png",
    "cardNumber": "SG03-007",
    "pack": "SG03 琥珀の庭",
    "color": [
      "琥珀の庭"
    ],
    "type": "術式",
    "rarity": "C",
    "tribe": "記憶",
    "cost": 1,
    "reduction": [
      "—"
    ],
    "effect": "自分の捨て札のコスト1以下のカード1枚を手札に戻す。\n\n一枚の葉にも、ひとつの季節。",
    "symbol": []
  },
  {
    "id": 10028,
    "name": "琥珀の砂時計",
    "image": "images/starlit/28.png",
    "cardNumber": "SG03-008",
    "pack": "SG03 琥珀の庭",
    "color": [
      "琥珀の庭"
    ],
    "type": "術式",
    "rarity": "U",
    "tribe": "時",
    "cost": 2,
    "reduction": [
      "—"
    ],
    "effect": "自分の山札の上3枚を見て、1枚を手札に加え、残りを捨てる。\n\n過ぎた時は、次の一歩を照らす。",
    "symbol": []
  },
  {
    "id": 10029,
    "name": "帰り道のしるべ",
    "image": "images/starlit/29.png",
    "cardNumber": "SG03-009",
    "pack": "SG03 琥珀の庭",
    "color": [
      "琥珀の庭"
    ],
    "type": "術式",
    "rarity": "C",
    "tribe": "道",
    "cost": 3,
    "reduction": [
      "—"
    ],
    "effect": "自分の捨て札の精霊1枚を手札に戻す。\n\n灯りはいつでも、帰る人を待っている。",
    "symbol": []
  },
  {
    "id": 10030,
    "name": "秋の星祭り",
    "image": "images/starlit/30.png",
    "cardNumber": "SG03-010",
    "pack": "SG03 琥珀の庭",
    "color": [
      "琥珀の庭"
    ],
    "type": "術式",
    "rarity": "R",
    "tribe": "祭",
    "cost": 5,
    "reduction": [
      "—"
    ],
    "effect": "自分の星灯を2増やす。\n\n実った願いを、空へ返す夜。",
    "symbol": []
  },
  {
    "id": 10031,
    "name": "霜花の侍女",
    "image": "images/starlit/31.png",
    "cardNumber": "SG04-001",
    "pack": "SG04 月白の庭",
    "color": [
      "月白の庭"
    ],
    "type": "精霊",
    "rarity": "C",
    "tribe": "獣人",
    "cost": 1,
    "reduction": [
      "1"
    ],
    "effect": "登場時：相手の力1以下の精霊1体を眠らせる。\n\n雪の上に、月の署名を残して。",
    "symbol": []
  },
  {
    "id": 10032,
    "name": "水鏡の白鳥",
    "image": "images/starlit/32.png",
    "cardNumber": "SG04-002",
    "pack": "SG04 月白の庭",
    "color": [
      "月白の庭"
    ],
    "type": "精霊",
    "rarity": "C",
    "tribe": "鳥",
    "cost": 2,
    "reduction": [
      "2"
    ],
    "effect": "登場時：自分の山札の上1枚を見て、上か下に戻す。\n\n水面の月だけが、彼女の行き先を知る。",
    "symbol": []
  },
  {
    "id": 10033,
    "name": "雪灯の狼",
    "image": "images/starlit/33.png",
    "cardNumber": "SG04-003",
    "pack": "SG04 月白の庭",
    "color": [
      "月白の庭"
    ],
    "type": "精霊",
    "rarity": "U",
    "tribe": "獣",
    "cost": 3,
    "reduction": [
      "3"
    ],
    "effect": "登場時：相手のコスト2以下の精霊1体を眠らせる。\n\n遠吠えは、離れた友への道しるべ。",
    "symbol": []
  },
  {
    "id": 10034,
    "name": "氷晶の亀",
    "image": "images/starlit/34.png",
    "cardNumber": "SG04-004",
    "pack": "SG04 月白の庭",
    "color": [
      "月白の庭"
    ],
    "type": "精霊",
    "rarity": "C",
    "tribe": "獣",
    "cost": 3,
    "reduction": [
      "4"
    ],
    "effect": "効果なし。\n\n凍った時の奥で、春を守る。",
    "symbol": []
  },
  {
    "id": 10035,
    "name": "夜渡りの鶴",
    "image": "images/starlit/35.png",
    "cardNumber": "SG04-005",
    "pack": "SG04 月白の庭",
    "color": [
      "月白の庭"
    ],
    "type": "精霊",
    "rarity": "U",
    "tribe": "鳥",
    "cost": 4,
    "reduction": [
      "3"
    ],
    "effect": "登場時：相手の精霊1体を眠らせる。\n\n翼の白さが、夜に道を描く。",
    "symbol": []
  },
  {
    "id": 10036,
    "name": "月冠の竜姫",
    "image": "images/starlit/36.png",
    "cardNumber": "SG04-006",
    "pack": "SG04 月白の庭",
    "color": [
      "月白の庭"
    ],
    "type": "精霊",
    "rarity": "R",
    "tribe": "竜人",
    "cost": 5,
    "reduction": [
      "5"
    ],
    "effect": "登場時：相手の力2以下の精霊1体を手札に戻す。\n\n冬の静けさは、次の物語の余白。",
    "symbol": []
  },
  {
    "id": 10037,
    "name": "静かなまどろみ",
    "image": "images/starlit/37.png",
    "cardNumber": "SG04-007",
    "pack": "SG04 月白の庭",
    "color": [
      "月白の庭"
    ],
    "type": "術式",
    "rarity": "C",
    "tribe": "夢",
    "cost": 1,
    "reduction": [
      "—"
    ],
    "effect": "相手の力2以下の精霊1体を眠らせる。\n\nよい夢を。続きは朝に。",
    "symbol": []
  },
  {
    "id": 10038,
    "name": "澄みわたる水鏡",
    "image": "images/starlit/38.png",
    "cardNumber": "SG04-008",
    "pack": "SG04 月白の庭",
    "color": [
      "月白の庭"
    ],
    "type": "術式",
    "rarity": "C",
    "tribe": "水",
    "cost": 2,
    "reduction": [
      "—"
    ],
    "effect": "カードを2枚引き、手札を1枚捨てる。\n\n答えは、心が静まると見えてくる。",
    "symbol": []
  },
  {
    "id": 10039,
    "name": "星霜の門",
    "image": "images/starlit/39.png",
    "cardNumber": "SG04-009",
    "pack": "SG04 月白の庭",
    "color": [
      "月白の庭"
    ],
    "type": "術式",
    "rarity": "U",
    "tribe": "門",
    "cost": 3,
    "reduction": [
      "—"
    ],
    "effect": "相手のコスト3以下の精霊1体を手札に戻す。\n\nさよならは、また会うための扉。",
    "symbol": []
  },
  {
    "id": 10040,
    "name": "冬の星祭り",
    "image": "images/starlit/40.png",
    "cardNumber": "SG04-010",
    "pack": "SG04 月白の庭",
    "color": [
      "月白の庭"
    ],
    "type": "術式",
    "rarity": "R",
    "tribe": "祭",
    "cost": 5,
    "reduction": [
      "—"
    ],
    "effect": "自分の星灯を2増やす。\n\nいちばん長い夜に、いちばん近い星を。",
    "symbol": []
  }
];
export default cards.map(applyVersionToCard);
