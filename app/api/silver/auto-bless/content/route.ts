import { NextRequest, NextResponse } from 'next/server';

const FESTIVALS: Record<string, { theme: string; content: string }> = {
  '01-01': { theme: '元旦', content: '元旦快樂，新年新希望' },
  '02-16': { theme: '除夕', content: '除夕快樂，闔家團圓' },
  '02-17': { theme: '春節', content: '新年快樂，恭喜發財' },
  '02-18': { theme: '春節', content: '新年快樂，萬事如意' },
  '02-19': { theme: '春節', content: '新年快樂，福氣滿滿' },
  '03-03': { theme: '元宵節', content: '元宵節快樂，闔家團圓' },
  '04-05': { theme: '清明節', content: '清明時節，緬懷感恩' },
  '05-10': { theme: '母親節', content: '母親節快樂，感恩媽媽的愛' },
  '06-19': { theme: '端午節', content: '端午節快樂，平安粽是福' },
  '08-08': { theme: '父親節', content: '父親節快樂，感恩爸爸的愛' },
  '09-25': { theme: '中秋節', content: '中秋節快樂，月圓人團圓' },
  '10-18': { theme: '重陽節', content: '重陽節快樂，敬老尊賢身體健康' },
  '12-22': { theme: '冬至', content: '冬至快樂，吃湯圓圓滿過冬' },
};

const MORNING = [
  '早安，祝您今天精神飽滿', '早安，新的一天充滿希望', '早安，願您一整天順心如意',
  '早安，記得多喝水、照顧好自己', '早安，今天也要開心過喔', '早安，陽光正好，心情也要美好',
];
const NIGHT = [
  '晚安，祝您有個好夢', '晚安，今天辛苦了，好好休息', '晚安，願您一夜安眠',
  '晚安，明天會更好', '晚安，平安入睡',
];
const WISDOM = [
  '要感恩惜福，平安快樂每一天', '知足常樂，心寬就是福', '健康就是財富，平安就是幸福',
  '笑口常開，好運自然來', '心存善念，福報自然來', '退一步是風平浪靜，讓三分也是和氣致祥',
  '人生不求事事如意，只求事事盡心', '簡單生活，快樂過日子', '凡事感恩，日日是好日',
  '心安就是福，平淡就是真', '與人為善，自有福報', '放下煩惱，珍惜當下',
  '身體健康，比什麼都重要', '家和萬事興，平安最幸福', '學會感恩，知足惜福',
];

// 視覺場景池：餵給 n8n 生圖節點當「具體背景」，避免 AI 每次都擺爛畫一朵花
// 依時段/主題分組，讓場景跟祝福語氛圍相搭（晚安不會配到大太陽）
const MORNING_SCENES = [
  '朝陽從山巒後升起，雲海泛著金光',
  '清晨的荷花池，露珠在花瓣上閃爍',
  '沾著晨露的向日葵花田，藍天白雲',
  '晨霧繚繞的綠色茶園梯田',
  '公園小徑灑滿晨光，櫻花盛開',
  '一杯冒著熱氣的茶，窗外晨曦微亮',
  '小鳥站在綻放的梅枝上，晨光柔和',
  '金黃稻田上的日出，溫暖光暈',
];
const NIGHT_SCENES = [
  '皎潔的滿月高掛，柔和雲彩環繞',
  '寧靜湖面倒映明月與點點星光',
  '庭院裡的桂花樹，月色朦朧',
  '溫暖的紅燈籠在夜色中散發柔光',
  '星空下的山巒剪影，銀河閃爍',
  '窗邊一盞暖燈，月光灑入房間',
  '荷塘月色，蓮花在夜裡靜靜綻放',
];
const WISDOM_SCENES = [
  '水墨風格的高山流水，雲霧繚繞',
  '蒼松與白鶴，傳統國畫意境',
  '蓮花在清澈池水中綻放，禪意十足',
  '遠山含黛，一葉扁舟泛於湖上',
  '蜿蜒山徑通往雲霧深處',
  '竹林小徑，陽光透過竹葉灑落',
  '蒼勁老松立於山崖，雲海翻騰',
  '寧靜的禪意庭園，枯山水與青苔',
];
const FESTIVAL_SCENES = [
  '滿園盛開的紅牡丹，金光灑落',
  '火紅燈籠高掛，喜氣洋洋',
  '金黃稻穗與飽滿果實，豐收意象',
  '紅梅綻放於白雪之中，喜氣吉祥',
  '一對鴛鴦戲水於荷花池，富貴祥和',
  '金色光芒放射，祥雲朵朵',
  '盛開的桃花林，粉色花瓣紛飛',
];

const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

export const dynamic = 'force-dynamic';

// GET /api/silver/auto-bless/content?userId=XXX
// n8n 排程呼叫，回傳當前時間對應的祝福主題與內容
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId') ?? '';

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const hour = now.getHours();
  const slot = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(hour)}`;
  const mmdd = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const festival = FESTIVALS[mmdd];
  let theme: string, content: string, visual: string;

  if (festival) {
    theme = festival.theme;
    content = festival.content;
    visual = pick(FESTIVAL_SCENES);
  } else if (hour === 6) {
    theme = '早安';
    content = pick(MORNING);
    visual = pick(MORNING_SCENES);
  } else if (hour === 21) {
    theme = '晚安';
    content = pick(NIGHT);
    visual = pick(NIGHT_SCENES);
  } else {
    theme = '哲理長輩圖';
    content = pick(WISDOM);
    visual = pick(WISDOM_SCENES);
  }

  return NextResponse.json({ userId, slot, theme, content, visual });
}
