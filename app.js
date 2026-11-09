import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js?v=1794211321';

'use strict';


  // ---------- trip data ----------
  const HOTEL = { lat: 20.705, lon: -86.957 };
  const DAYS = [
    { key: '2026-11-20', md: '11/20', dow: '周五', wd: 5, tag: '抵达日', cap: 5, note: '13:21 AA1503 落地坎昆 T3，到酒店约 15:00 入住；想出门的话傍晚去第五大道正好' },
    { key: '2026-11-21', md: '11/21', dow: '周六', wd: 6, tag: '', cap: 12 },
    { key: '2026-11-22', md: '11/22', dow: '周日', wd: 0, tag: '', cap: 12, note: '周日遗址对墨西哥居民免费，会很挤；Xplor、Xenses 休园' },
    { key: '2026-11-23', md: '11/23', dow: '周一', wd: 1, tag: '', cap: 12 },
    { key: '2026-11-24', md: '11/24', dow: '周二', wd: 2, tag: '', cap: 12, note: 'Xel-Há 周二休园' },
    { key: '2026-11-25', md: '11/25', dow: '周三', wd: 3, tag: '退房日', cap: 4, note: '11:00 退房；16:00 AA1799 起飞（T3），最晚 12:45 从酒店出发，机场约 45 分钟' },
  ];
  const CATS = {
    cave:   { label: '洞穴 & 天然井', color: 'var(--cat-cave)' },
    ruin:   { label: '玛雅遗址',       color: 'var(--cat-ruin)' },
    park:   { label: '主题乐园',       color: 'var(--cat-park)' },
    sea:    { label: '海岛 & 海滩',    color: 'var(--cat-sea)' },
    town:   { label: '小镇 · 美食 · 演出', color: 'var(--cat-town)' },
    nature: { label: '自然 & 野生动物', color: 'var(--cat-nature)' },
    rest:   { label: '酒店内',         color: 'var(--cat-rest)' },
  };
  // in-hotel activities: drive 0, never count as an outing; meal marks a lunch/dinner slot so a day warns on doubles
  const HOTEL_ITEMS = [
    { id: 'h-teodoro', zh: 'Teodoro 七道式品鉴晚餐', en: 'Teodoro · Impression 专属', hours: 2.5, meal: 'dinner',
      cost: '住满 5 晚含一次，否则约 US$ 250/人 · 正装',
      blurb: 'AAA 五钻餐厅，每晚换的七道式菜单配酒，墨西哥食材法式手法。你们住 5 晚刚好有一次免费额度，入住当天就让管家锁位。',
      tips: ['18:00–22:30', '正装：男士长裤、有袖衬衫、包头鞋', '两人是否都在免费额度内，和管家确认'], tags: ['晚餐', '专属', '要订'] },
    { id: 'h-suki', zh: 'Suki 日料：铁板烧 / Omakase', en: 'Suki · Tanoshii Omakase', hours: 2, meal: 'dinner',
      cost: '含 · Omakase 吧台加价（住 5 晚管家有时可免）',
      blurb: '现代日料，铁板烧桌边表演，或在 Tanoshii 吧台吃主厨 omakase。两种都要提前订。',
      tips: ['18:00–23:00', '铁板烧桌人多，尽早订'], tags: ['晚餐', '要订'] },
    { id: 'h-ember', zh: 'Ember 明火烤肉', en: 'Ember', hours: 2, meal: 'dinner',
      cost: '含 · 高级部位 / 龙虾加价',
      blurb: '开放式明火烤架和烟熏房，是全酒店最抢手的晚餐。',
      tips: ['18:00–23:00', '不订的话 19–20 点要等 1–2 小时'], tags: ['晚餐', '最抢手'] },
    { id: 'h-dos-almas', zh: 'Dos Almas 墨西哥菜 & Taco 吧', en: 'Dos Almas', hours: 2, meal: 'dinner',
      cost: '含 · 七道式 taco 吧配酒加价',
      blurb: '正宗墨西哥菜，6 个座位的七道式 taco 吧台配龙舌兰和梅斯卡尔；院子里每晚有街头小吃摊。',
      tips: ['18:00–23:00', 'taco 吧通过管家或 Hyatt Experiences 预订'], tags: ['晚餐'] },
    { id: 'h-bisou', zh: 'Bisou 法餐', en: 'Bisou', hours: 2, meal: 'dinner',
      cost: '含 · 正装',
      blurb: '法式正餐，着装要求最严格，适合留给最后一晚。',
      tips: ['18:00–23:00', '无袖、拖鞋进不去'], tags: ['晚餐', '正装'] },
    { id: 'h-seasoul', zh: 'Seasoul 海鲜午餐', en: 'Seasoul', hours: 2, meal: 'lunch',
      cost: '含',
      blurb: '住客公认最好吃的午餐；周五有阿根廷式 asado 烤肉，晚餐时段有杂技表演。',
      tips: ['午餐 11:30–17:00，晚餐 19:00–23:00'], tags: ['午餐'] },
    { id: 'h-rooftop', zh: '屋顶无边泳池 + Cielo 午餐', en: 'Impression Rooftop · Cielo', hours: 4, meal: 'lunch',
      cost: '含 · 部分卡巴纳可能收费',
      blurb: '9 楼 Impression 专属屋顶：一条长泳池、一个面海无边泳池、两个热水池，Cielo 餐厅就在旁边。日落朝西看丛林，是酒店最好的日落位。',
      tips: ['约 10:00–20:00；Cielo 午餐 11–17', '风大时水偏凉，下午更舒服'], tags: ['泳池', '日落'] },
    { id: 'h-hydro', zh: 'Spa 水疗循环', en: 'Secrets Spa by Pevonia · Hydrotherapy', hours: 2,
      cost: '每人含一次（据住客）· 之后按次付费；疗程另计',
      blurb: '桑拿、蒸汽、冲击水柱、反射步道、瀑布、冷热桶、水力按摩床一圈约 50 分钟，接着可以加一个按摩。',
      tips: ['让管家预订，4 小时内取消收费', '50 分钟按摩 2023 年参考价约 US$ 239', 'Temazcal 玛雅汗蒸另收费'], tags: ['SPA', '要订'] },
    { id: 'h-theatre', zh: '剧院晚间秀 + Gypsy 地下酒吧', en: 'Moxché Theatre · Gypsy Speakeasy', hours: 2.5,
      cost: '含',
      blurb: '每晚约 21:00 一场马戏风格大秀，Impression 住客有专属座位和送酒服务；散场后拿着当天的暗号去药店后面的 Gypsy 喝一杯。',
      tips: ['秀约 21:00，Gypsy 22:30–1:00', '暗号问工作人员或看秀的结尾'], tags: ['晚上'] },
    { id: 'h-cenote-pools', zh: '天然井风格泳池 & 泻湖', en: 'Secrets 侧 cenote pools & lagoon', hours: 3,
      cost: '含',
      blurb: 'Secrets 那边有 3 个天然井风格的安静泳池（吊床、藏起来的热水池）和一个带沙滩的人工泻湖，是最适合发呆的地方。',
      tips: ['泻湖躺椅要早去占', 'Sugar Reef、Mantaray 两个泳池吧在旁边'], tags: ['泳池', '安静'] },
    { id: 'h-watersports', zh: '皮划艇 / SUP / 帆船', en: 'Water sports (included)', hours: 2,
      cost: '含（浮潜装备个别资料标另收）',
      blurb: '海滩有皮划艇、桨板、Hobie Cat 帆船、帆板可以直接用，每天也有带队的皮划艇和 SUP 团。',
      tips: ['早上风小浪平', '潜水、双体船、海钓要另付'], tags: ['海上'] },
    { id: 'h-sports', zh: '屋顶匹克球 / 网球 / 瑜伽', en: 'Pickleball · Tennis · Yoga', hours: 1.5,
      cost: '含（球场要预约）',
      blurb: '屋顶有 2 个匹克球场，还有网球场、壁球、射箭、沙滩瑜伽和冥想课，日程在 App 里。',
      tips: ['匹克球场通过管家预约', '早上 7–9 点凉快'], tags: ['运动'] },
    { id: 'h-sunrise', zh: '海滩日出 + Seaside 早餐', en: 'Sunrise · Seaside Beach Club', hours: 1.5,
      cost: '含',
      blurb: '这段海岸朝东，日出直接从海面升起，能看到远处的科苏梅尔岛。看完走到 Seaside 海滩俱乐部吃点单早餐。',
      tips: ['11 月下旬日出约 6:30', 'Seaside 早餐 7:00–11:00'], tags: ['早晨'] },
    { id: 'h-roads', zh: 'Roads to Mexico 街头小吃夜', en: 'Roads to Mexico', hours: 2,
      cost: '含',
      blurb: '每周一晚的墨西哥各地街头小吃集市，住客口中的必去。具体哪天问管家，再排进那天的晚上。',
      tips: ['每周一次，日期以管家为准', '可以不订餐厅，直接吃这个'], tags: ['晚上', '每周一次'] },
    { id: 'h-brunch', zh: 'Cielo 屋顶早午餐', en: 'Cielo Rooftop Brunch', hours: 3,
      cost: '加价约 US$ 200/人', closedNote: '通常仅周末',
      blurb: '周末 10–16 点的屋顶早午餐，香槟和海鲜管够，是酒店里少数要额外付费但口碑很好的活动。',
      tips: ['通常只在周末，问管家 11/21、11/22 有没有', '只想看风景的话 Cielo 普通午餐就够'], tags: ['加价', '周末'] },
  ];
  // drive = one-way minutes from the hotel; hours = time on site; closed = JS weekdays (0 = Sunday) the place is shut
  const SITES = [
    { id: 'rio-secreto', zh: '秘密河地下洞穴', en: 'Río Secreto', cat: 'cave', lat: 20.593, lon: -87.132, drive: 30, hours: 3.5,
      cost: 'US$ 89/人（含接送 US$ 119）· Plus 版 US$ 109',
      blurb: '整个里维埃拉玛雅最经典的「洞穴」体验：穿潜水服戴头灯，在钟乳石密布的地下河里徒步加游泳约 1.5 小时，最后关掉所有头灯听水滴声。',
      tips: ['必须提前官网预订；周一到周五 9/10/11/12/13 点出发，周末只有 9/11/13 点', '全程不能带相机手机，官方摄影师拍照另售', 'Plus 版 9 点或 11 点出发，含午餐'],
      tags: ['必去', '地下河', '约 3.5 小时'], link: 'https://www.riosecreto.com', q: 'Rio Secreto Playa del Carmen', cluster: 'playa-south' },
    { id: 'dos-ojos', zh: '双眼天然井', en: 'Cenote Dos Ojos', cat: 'cave', lat: 20.3245, lon: -87.3905, drive: 60, hours: 2.5,
      cost: '约 MXN 400/人（自带浮潜）· 含蝙蝠洞导览约 MXN 800',
      blurb: '两个相连的洞穴天然井，水下能见度近百米，是全球最著名的洞穴潜水和浮潜点之一。沿绳索浮潜穿过「蝙蝠洞」，钟乳石倒映在湛蓝水中。',
      tips: ['8:00 开门，9 点前到人最少、光线最好；最晚 15 点入园', '只收现金', '园区内还有 Taak Bi Ha、Nicte-Ha，可一起玩', '持潜水证可报 Cavern 潜水'],
      tags: ['浮潜', '现金'], q: 'Cenote Dos Ojos', cluster: 'tulum' },
    { id: 'taak-bi-ha', zh: '塔克比哈洞穴天然井', en: 'Cenote Taak Bi Ha', cat: 'cave', lat: 20.329, lon: -87.395, drive: 62, hours: 1.5,
      cost: '约 MXN 350/人（含导览约 MXN 400）· 在 Dos Ojos 大门买票',
      blurb: '藏在 Dos Ojos 园区深处的全封闭洞穴天然井：从一个小洞口沿梯子下去，整个洞顶挂满钟乳石，水面像镜子一样把它们倒映出来。人少、安静，「洞穴感」最强。',
      tips: ['限流，建议和 Dos Ojos 同一天', '洞内很暗，带防水手机壳或租 GoPro', '水温约 24 °C，怕冷可租潜水服'],
      tags: ['洞穴感最强', '限流'], q: 'Cenote Taak Bi Ha', cluster: 'tulum' },
    { id: 'sac-actun', zh: '萨克阿克顿洞穴浮潜', en: 'Sac Actun · Pet Cemetery', cat: 'cave', lat: 20.335, lon: -87.40, drive: 62, hours: 3,
      cost: '园区导览约 MXN 800/人；旅行社含 Casa Cenote 套餐约 US$ 155',
      blurb: '世界最长的水下洞穴系统，必须跟导游戴头灯浮潜：穿过布满钟乳石的狭窄通道，水底散落着古代动物骨骼。比 Dos Ojos 更原始、更「探险」。',
      tips: ['只能跟团，提前预订', '狭窄处略有压迫感，怕幽闭的人慎选', '就在 Dos Ojos 园区内，可替代普通浮潜'],
      tags: ['跟团', '探险'], q: 'Pet Cemetery Cenote Sac Actun', cluster: 'tulum' },
    { id: 'gran-cenote', zh: '大天然井', en: 'Gran Cenote', cat: 'cave', lat: 20.247, lon: -87.464, drive: 70, hours: 2,
      cost: 'MXN 500/人（含救生衣）· 现金',
      blurb: '图卢姆最受欢迎的半开放式天然井：阳光洒进水面，水里有小海龟和鱼群游来游去，洞穴部分可以浮潜穿过。',
      tips: ['8:00–16:45，人很快就多，尽早去', '不能涂防晒霜下水，入口有淋浴', '可和图卢姆遗址同一天'],
      tags: ['海龟', '现金'], q: 'Gran Cenote Tulum', cluster: 'tulum' },
    { id: 'calavera', zh: '骷髅天然井', en: 'Cenote Calavera', cat: 'cave', lat: 20.236, lon: -87.456, drive: 70, hours: 1,
      cost: '约 MXN 300/人',
      blurb: '地面上三个洞口像骷髅的两眼一嘴，可以直接从洞口跳进下面的水潭。小而刺激，半小时足够。',
      tips: ['就在去 Gran Cenote 的路上', '下面是潜水员常用的入口'],
      tags: ['跳水', '半小时'], q: 'Cenote Calavera Tulum', cluster: 'tulum' },
    { id: 'chaak-tun', zh: '查克顿洞穴天然井', en: 'Cenote Chaak Tun', cat: 'cave', lat: 20.618, lon: -87.112, drive: 20, hours: 2,
      cost: '约 MXN 500/人（含强制导览、头盔、救生衣）',
      blurb: '离酒店最近的洞穴天然井，就在普拉亚卡门西郊。两个洞穴需戴头盔和头灯进入，导览会讲玛雅传说，洞里能看到蝙蝠和钟乳石。',
      tips: ['开放时间不固定（周末可能只开到 13–15 点），去前用 WhatsApp 确认', '人少，适合到达后第二天「热身」', '从酒店打车约 20 分钟'],
      tags: ['离酒店最近', '需确认'], q: 'Cenote Chaak Tun', cluster: 'playa' },
    { id: 'cenote-azul', zh: '蓝色天然井', en: 'Cenote Azul', cat: 'cave', lat: 20.497, lon: -87.252, drive: 40, hours: 2,
      cost: '约 MXN 180/人 · 现金',
      blurb: '开放式、水很浅的天然井，有一块可以跳水的岩台，小鱼会来啄脚。更像天然泳池，适合下午放松。',
      tips: ['8:00–18:00；周末当地家庭多，工作日更清静', 'Jardín del Edén 和 Cristalino 就在隔壁，一下午可以玩两三个'],
      tags: ['轻松', '跳水'], q: 'Cenote Azul Riviera Maya', cluster: 'puerto-aventuras' },
    { id: 'jardin-eden', zh: '伊甸园天然井', en: 'Cenote Jardín del Edén', cat: 'cave', lat: 20.50, lon: -87.25, drive: 40, hours: 2,
      cost: '约 MXN 300/人 · 现金', closed: [6], closedNote: '部分周六不开放，去前确认',
      blurb: '又叫 Ponderosa，一大片被丛林包围的深蓝水面，适合跳水和浮潜，水下有大石缝，潜水员也常来。',
      tips: ['历史上周六常不开放，去前确认', '跳台约 3–4 米'],
      tags: ['浮潜'], q: 'Cenote Jardin del Eden', cluster: 'puerto-aventuras' },
    { id: 'cristalino', zh: '水晶天然井', en: 'Cenote Cristalino', cat: 'cave', lat: 20.495, lon: -87.258, drive: 40, hours: 1.5,
      cost: '约 MXN 180/人 · 现金',
      blurb: '名字就说明了一切，水极其透明。一侧有一小段洞穴可以游进去，另一侧是开阔的跳水区。',
      tips: ['8:00–18:00', '与 Azul、Jardín del Edén 相邻，三选二即可'],
      tags: ['小洞穴'], q: 'Cenote Cristalino', cluster: 'puerto-aventuras' },
    { id: 'aktun-chen', zh: '阿克顿琛洞穴公园', en: 'Aktun Chen', cat: 'cave', lat: 20.42, lon: -87.33, drive: 55, hours: 3.5,
      cost: '洞穴 MXN 580 · 天然井 MXN 650 · 滑索 MXN 880，有套票',
      blurb: '一个五百万年历史的干洞穴，专业导览带着在钟乳石和石笋间走约 1 小时，最深处是一池清澈的地下天然井。园区还有丛林滑索和小动物园。',
      tips: ['9:30–17:00 每天开放', '干洞穴不用下水，适合不想游泳的日子', '与 Akumal 海龟湾顺路'],
      tags: ['干洞穴', '不用下水'], link: 'https://www.aktun-chen.com', q: 'Aktun Chen', cluster: 'akumal' },
    { id: 'coba-cenotes', zh: '科巴洞穴天然井三连', en: 'Choo-Ha · Tamcach-Ha · Multum-Ha', cat: 'cave', lat: 20.47, lon: -87.78, drive: 120, hours: 2.5,
      cost: '每个约 MXN 150/人 · 现金',
      blurb: '科巴以南的玛雅村庄管理着三个完全在地下的洞穴天然井：沿木梯螺旋而下，到达钟乳石环绕的幽暗水潭。Tamcach-Ha 有 5 米和 10 米跳台。',
      tips: ['人非常少，是真正的「洞穴」体验', '和科巴遗址同一天', '入口在 Cobá 镇往南约 15 分钟'],
      tags: ['人少', '真·洞穴'], q: 'Cenote Choo-Ha Coba', cluster: 'coba' },
    { id: 'ruta-cenotes', zh: '莫雷洛斯港天然井之路', en: 'Ruta de los Cenotes · Siete Bocas / Verde Lucero', cat: 'cave', lat: 20.86, lon: -87.02, drive: 40, hours: 4,
      cost: 'Siete Bocas 约 MXN 300 · Verde Lucero 约 MXN 250',
      blurb: '酒店往北的一条丛林公路，沿途十几个天然井。Siete Bocas 是有七个洞口的洞穴天然井；Verde Lucero 有滑索直接荡进水里。',
      tips: ['9:00–18:00；Siete Bocas 在 km 15.5 再进 2 公里土路', '适合半天：挑 2 个天然井', '回程在莫雷洛斯港镇上吃海鲜', '人比图卢姆那边少很多'],
      tags: ['半天', '人少'], q: 'Cenote Siete Bocas Puerto Morelos', cluster: 'puerto-morelos' },
    { id: 'suytun', zh: '苏伊顿天然井', en: 'Cenote Suytun', cat: 'cave', lat: 20.705, lon: -88.113, drive: 135, hours: 1.5,
      cost: '约 MXN 250/人 · 限时 1 小时',
      blurb: '网红照片里那束从洞顶射下来、正好打在圆形石台上的光，就是这里。正午 12 点前后光束最明显。',
      tips: ['8:00–19:00；离奇琴伊察约 40 分钟，适合同一天顺路', '拍石台照需排队，旺季一人只给几秒'],
      tags: ['打卡', '顺路'], q: 'Cenote Suytun', cluster: 'valladolid' },

    { id: 'tulum-ruins', zh: '图卢姆玛雅遗址', en: 'Zona Arqueológica de Tulum', cat: 'ruin', lat: 20.2146, lon: -87.4290, drive: 75, hours: 2.5,
      cost: 'MXN 265/人（2026 年 7 月起单一门票，含美洲豹公园）· 停车约 MXN 150',
      blurb: '全墨西哥唯一建在加勒比海悬崖上的玛雅城邦，El Castillo 神庙下面就是绿松石色的海。遗址不大，但景色是整个半岛最上镜的。',
      tips: ['8:00–17:00，最晚 16 点入场；务必 8 点到，旅行团 10 点左右到达', '售票处离遗址约 1 公里，步行或付费小火车', '带泳衣：遗址下方的 Playa Ruinas 可以下海', '周日墨西哥居民免费，会非常挤'],
      tags: ['必去', '海边遗址'], link: 'https://www.inah.gob.mx/zonas/99-zona-arqueologica-de-tulum', q: 'Tulum Archaeological Zone', cluster: 'tulum' },
    { id: 'coba', zh: '科巴遗址', en: 'Cobá', cat: 'ruin', lat: 20.4949, lon: -87.7338, drive: 110, hours: 3,
      cost: 'MXN 210/人 · 租单车约 MXN 100',
      blurb: '藏在丛林和湖泊之间的大型玛雅城邦，几座金字塔之间相隔两三公里，大家骑着单车在白色小路上穿行。42 米高的 Nohoch Mul 是半岛最高的金字塔，2025 年底起又可以沿新木梯爬上去了。',
      tips: ['8:00–17:00；木梯下雨刮风会关闭，据说 15:30 后停止上行', '租单车或坐三轮车，否则走到腿软', '搭配科巴洞穴天然井或蜘蛛猴保护区'],
      tags: ['可以爬金字塔', '骑车'], link: 'https://www.inah.gob.mx/zonas/97-zona-arqueologica-de-coba', q: 'Coba Ruins', cluster: 'coba' },
    { id: 'chichen', zh: '奇琴伊察', en: 'Chichén Itzá', cat: 'ruin', lat: 20.6843, lon: -88.5678, drive: 170, hours: 3.5,
      cost: '约 MXN 700/人（联邦 + 州政府，2026 年起一次付清）',
      blurb: '世界新七大奇迹之一：库库尔坎金字塔、大球场、武士神庙。单程近 3 小时，但对大多数人来说值得一整天。',
      tips: ['8:00–16:00，最晚 15 点入场；务必 6:30–7:00 出发，10 点后又热又挤', '回程顺路：Cenote Suytun 或 Ik Kil、巴利亚多利德小镇', '晚上有灯光秀 Noches de Kukulkán（另购票，看完回酒店很晚）', '周日居民免费，避开'],
      tags: ['世界奇迹', '长途'], link: 'https://www.chichenitza.com', q: 'Chichen Itza', cluster: 'chichen', warn: '单程约 3 小时，这一天别再往南边排别的' },
    { id: 'ek-balam', zh: '埃克巴兰遗址 + X\'Canché 天然井', en: 'Ek Balam', cat: 'ruin', lat: 20.8912, lon: -88.1361, drive: 150, hours: 3,
      cost: 'MXN 691/人 + 停车 MXN 100 · 天然井约 MXN 180',
      blurb: '比奇琴伊察安静得多的遗址，而且主金字塔 (Acrópolis) 可以爬，上面有保存极好的灰泥雕塑。旁边 2 公里有个可以骑车去的天然井。',
      tips: ['可代替奇琴伊察（人少、能爬），或在同一天连刷（会很累）', '离巴利亚多利德 25 分钟'],
      tags: ['人少', '可以爬'], q: 'Ek Balam', cluster: 'valladolid' },
    { id: 'muyil', zh: '穆伊尔遗址 + 西安卡安漂流', en: 'Muyil & Sian Ka\'an', cat: 'ruin', lat: 20.08, lon: -87.61, drive: 100, hours: 4,
      cost: '遗址 MXN 145 + 保护区约 MXN 225 + 船费另付；旅行社套餐约 US$ 140–220',
      blurb: '先逛一个小小的丛林遗址（2026 年 2 月整修后重开），沿木栈道走到泻湖，坐船穿过红树林，最后穿着救生衣躺在古玛雅人挖的运河里顺水漂 20 分钟。',
      tips: ['西安卡安是联合国生物圈保护区', '可和图卢姆合并，但那天会很长'],
      tags: ['漂流', '生物圈'], q: 'Muyil Archaeological Zone', cluster: 'sian-kaan' },

    { id: 'xcaret', zh: '西卡莱特公园', en: 'Xcaret', cat: 'park', lat: 20.5798, lon: -87.1197, drive: 25, hours: 9,
      cost: 'Basic 约 MXN 2,756（≈US$ 160）· Plus 含自助餐约 MXN 3,311',
      blurb: '墨西哥最大的生态文化乐园，三条地下河可以一路浮潜漂到海边，还有海龟、蝴蝶馆、玛雅村。晚上约 19:00 的《México Espectacular》歌舞秀 300 名演员，所有门票都含。',
      tips: ['8:30–22:00，建议中午去、看完夜秀回', 'Plus 票含自助餐，比园内单点划算', '官网提前买比门口便宜 10–15%'],
      tags: ['地下河', '夜秀'], link: 'https://www.xcaret.com', q: 'Xcaret Park', cluster: 'playa-south' },
    { id: 'xplor', zh: '探险公园 Xplor（白天）', en: 'Xplor', cat: 'park', lat: 20.5767, lon: -87.1172, drive: 25, hours: 6,
      cost: '约 US$ 140–160/人（全包餐饮）', closed: [0], closedNote: '周日休园',
      blurb: '滑索飞越丛林、开两栖车穿过洞穴、在地下河划筏和游泳，后两项其实就是在真实的钟乳石洞里。门票含自助餐和饮料。',
      tips: ['周一到周六 9:00–17:00，周日休园', '官网提前买有 10–15% 折扣', '只想晚上出门的话看下面的 Xplor Fuego 夜场'],
      tags: ['地下河', '滑索'], link: 'https://www.xplor.travel', q: 'Xplor Park', cluster: 'playa-south' },
    { id: 'xplor-fuego', zh: 'Xplor Fuego 夜场', en: 'Xplor Fuego', cat: 'park', lat: 20.5767, lon: -87.1172, drive: 25, hours: 5, slot: 'eve',
      cost: '约 US$ 130/人（含自助晚餐和饮料）', closed: [0], closedNote: '周日休园',
      blurb: '17:30 开园到 23:00 的夜间版 Xplor：火把照亮的地下河里划筏和游泳，滑索飞过夜晚的丛林。白天在酒店泡完泳池，傍晚再出门正合适。',
      tips: ['周一到周六 17:30–23:00', '含自助晚餐，这天可以不在酒店吃晚饭', '别和白天的 Xplor 重复买'],
      tags: ['地下河', '滑索'], link: 'https://www.xplor.travel', q: 'Xplor Park', cluster: 'playa-south' },
    { id: 'xelha', zh: '谢尔哈水上公园', en: 'Xel-Há', cat: 'park', lat: 20.318, lon: -87.361, drive: 60, hours: 7,
      cost: '约 MXN 2,571（≈US$ 140）/人，全包餐饮', closed: [2], closedNote: '周二休园',
      blurb: '一个巨大的天然海水泻湖改造成的浮潜公园：鱼多、水清、全天餐饮酒水全包，还有漂流河、悬崖跳台和灯塔滑梯。适合想「躺平式」玩水的一天。',
      tips: ['8:30–18:00，周二休园', '离图卢姆 20 分钟，可上午遗址、下午 Xel-Há', '只能用可降解防晒霜'],
      tags: ['全包'], link: 'https://www.xelha.com', q: 'Xel-Ha Park', cluster: 'tulum' },
    { id: 'xenses', zh: '感官公园 Xenses', en: 'Xenses', cat: 'park', lat: 20.5755, lon: -87.1185, drive: 25, hours: 4,
      cost: '约 US$ 80/人', closed: [0, 3], closedNote: '周三、周日休园',
      blurb: '半天就能玩完的错觉乐园：倾斜的小镇、盐水漂浮河、泥浴滑道。适合搭配 Xplor Fuego 组成一天。',
      tips: ['周一、二、四、五、六 8:30–19:00，周三和周日休园', '与 Xplor Fuego 联票划算'],
      tags: ['半天'], link: 'https://www.xcaret.com/en/parks-and-tours/xenses-admission/', q: 'Xenses Park', cluster: 'playa-south' },

    { id: 'cozumel', zh: '科苏梅尔岛', en: 'Isla Cozumel', cat: 'sea', lat: 20.51, lon: -86.95, drive: 25, hours: 9,
      cost: '渡轮单程 MXN 320–380 + 码头费 MXN 24（Xcaret Xailing 约 US$ 16）· 浮潜团约 US$ 50–70',
      blurb: '从普拉亚卡门码头坐 35–40 分钟渡轮，到达加勒比海最著名的潜水岛。Palancar、Colombia 礁和「El Cielo」海星浅滩是必去浮潜点；租辆吉普绕岛一圈，东岸是野性的无人海滩。',
      tips: ['Ultramar 每天约 9 班 9:00–21:00，Xcaret Xailing 整点一班；码头在第五大道南端 Calle 1', '酒店到码头约 25 分钟，建议坐 9 点船', '浮潜船团在岛上码头现场就能报'],
      tags: ['浮潜', '渡轮'], link: 'https://www.ultramarferry.com', q: 'Ultramar Ferry Terminal Playa del Carmen', cluster: 'cozumel' },
    { id: 'isla-mujeres', zh: '女人岛', en: 'Isla Mujeres', cat: 'sea', lat: 21.2322, lon: -86.7312, drive: 70, hours: 8,
      cost: '渡轮往返约 MXN 600/人 · 高尔夫球车约 US$ 50/天；Isla Contoy 团约 US$ 110–180',
      blurb: '坎昆对面的小岛，Playa Norte 常年排在全球最美海滩前列。租一辆高尔夫球车绕岛一圈，南端 Punta Sur 的悬崖和海龟农场都值得停。',
      tips: ['开到 Puerto Juárez 码头约 1 小时 10 分，渡轮 20 分钟', '鸟类保护区 Isla Contoy 每天限 200 人，含普拉亚接送约 US$ 125，需提前订', '刮北风 (norte) 的日子船可能停航'],
      tags: ['海滩', '坎昆方向'], q: 'Puerto Juarez Ultramar Ferry', cluster: 'cancun' },
    { id: 'akumal', zh: '阿库马尔海龟湾', en: 'Akumal Bay', cat: 'sea', lat: 20.3958, lon: -87.3147, drive: 45, hours: 2,
      cost: '海滩入场约 MXN 120 · 导游浮潜约 MXN 900（≈US$ 48，55–65 分钟）', closed: [1], closedNote: '周一据报为休息日，去前确认',
      blurb: '海草床上常年有绿海龟吃草，离岸几十米就能看到。浮标圈内必须由持证导游带领（6 人一组、穿救生衣、不涂防晒霜），反而让海龟更不怕人。',
      tips: ['9:00–17:00，早上 9 点海龟最多', '拒绝沙滩上拉客的，去 Akumal Dive Shop 或 CEA 报名', '下午可顺路去 Aktun Chen 或 Xpu-Ha'],
      tags: ['海龟'], q: 'Akumal Bay', cluster: 'akumal' },
    { id: 'xpuha', zh: '徐普哈海滩', en: 'Playa Xpu-Ha', cat: 'sea', lat: 20.47, lon: -87.29, drive: 35, hours: 4,
      cost: '海滩俱乐部入场约 MXN 100–200/人（可抵消费）',
      blurb: '里维埃拉玛雅口碑最好的公共海滩之一：细白沙、浅而清的水、椰子树，没有大酒店。La Playa Xpu-Ha 俱乐部有躺椅和海鲜。',
      tips: ['11 月下旬马尾藻通常很少，是海滩好季节', '适合半天：上午天然井、下午海滩'],
      tags: ['海滩', '半天'], q: 'Playa Xpu-Ha', cluster: 'puerto-aventuras' },
    { id: 'tulum-beach', zh: '图卢姆海滩区', en: 'Tulum Beach · Playa Paraíso', cat: 'sea', lat: 20.199, lon: -87.437, drive: 80, hours: 4,
      cost: '公共海滩免费；俱乐部最低消费约 US$ 50–100/人',
      blurb: '遗址正下方的 Playa Paraíso 和往南一路的精品海滩俱乐部（Papaya Playa、Taboo…）。白沙、棕榈树、波西米亚风，也是拍照重灾区。',
      tips: ['俱乐部消费高，预算有限就去 Paraíso 公共段', '停车位很少且贵'],
      tags: ['海滩', '网红'], q: 'Playa Paraiso Tulum', cluster: 'tulum' },
    { id: 'musa', zh: '坎昆水下博物馆 MUSA', en: 'MUSA Underwater Museum', cat: 'sea', lat: 21.03, lon: -86.78, drive: 60, hours: 4,
      cost: '浮潜团约 US$ 60–80/人',
      blurb: '500 多座真人大小的水泥雕塑沉在 4–8 米深的海底，已经长满珊瑚。浮潜或潜水都能看，船从坎昆酒店区出发。',
      tips: ['海况不好时会改点，报团前问清', '可和女人岛同一天（都在坎昆方向）'],
      tags: ['浮潜', '坎昆方向'], link: 'https://musamexico.org', q: 'MUSA Underwater Museum Cancun', cluster: 'cancun' },
    { id: 'holbox', zh: '霍尔博克斯岛', en: 'Isla Holbox', cat: 'sea', lat: 21.52, lon: -87.38, drive: 165, hours: 10,
      cost: '渡轮单程约 MXN 330/人，每半小时一班',
      blurb: '没有汽车的慵懒小岛，浅滩可以走进海里几百米，夜里有发光浮游生物。但从酒店开到 Chiquilá 码头要 2 小时 45 分，再坐 25 分钟船。',
      tips: ['往返路上就要 6 小时，不适合当日往返，想去建议住一晚', '11 月已过鲸鲨季（6–9 月）'],
      tags: ['太远', '需过夜'], q: 'Chiquila Ferry Terminal', cluster: 'holbox', warn: '单程 3 小时以上，不建议当日往返' },

    { id: 'quinta', zh: '普拉亚卡门第五大道', en: 'Quinta Avenida & Parque Fundadores', cat: 'town', lat: 20.6274, lon: -87.0760, drive: 15, hours: 3, slot: 'eve',
      cost: '免费（餐饮自理）· 出租车约 MXN 250–350',
      blurb: '酒店南边 15 分钟的步行街，餐厅、酒吧、手工艺店一路延伸到码头。日落时分 Parque Fundadores 有托托纳克「飞人」从 30 米高的柱子上倒挂旋转而下（免费，靠小费）。',
      tips: ['适合抵达当天傍晚，或任何一天的晚餐', '海滩段 Playa Mamitas 白天也可以逛', '2026 年起 Tren Maya 普拉亚站有接驳车到市中心'],
      tags: ['傍晚', '晚餐'], q: 'Parque Fundadores Playa del Carmen', cluster: 'playa' },
    { id: 'joya', zh: '太阳马戏团 JOYÀ', en: 'Cirque du Soleil JOYÀ · Vidanta Riviera Maya', cat: 'town', lat: 20.715, lon: -86.945, drive: 10, hours: 3.5, slot: 'eve',
      cost: '演出票约 US$ 95 起 · 含晚餐套票约 US$ 180', closed: [0, 1], closedNote: '周日、周一无演出；2026 年档期以官网为准',
      blurb: '太阳马戏团在墨西哥唯一的驻场秀，剧场就在隔壁的 Vidanta 度假村，离酒店不到 10 分钟。600 人的小剧场，可以选含晚餐的套票边吃边看。白天泡酒店、晚上看秀，是最省力的一次「出门」。',
      tips: ['通常周二到周六晚上演出，含晚餐场约 19:00 入场，纯演出 20:30 开演', '提前官网订票，周末容易满', '打车来回最方便'],
      tags: ['驻场秀', '离酒店 10 分钟'], link: 'https://www.cirquedusoleil.com/joya', q: 'Cirque du Soleil JOYA Vidanta Riviera Maya', cluster: 'hotel-near' },
    { id: 'valladolid', zh: '巴利亚多利德小镇', en: 'Valladolid', cat: 'town', lat: 20.6896, lon: -88.2011, drive: 135, hours: 3,
      cost: '免费 · 镇中心 Zací 天然井 MXN 60',
      blurb: '尤卡坦最漂亮的殖民小镇：彩色房子的 Calzada de los Frailes、16 世纪的 San Bernardino 修道院，镇中心就有一个天然井。必吃 cochinita pibil 和 lomitos de Valladolid。',
      tips: ['奇琴伊察回程顺路吃午饭或晚饭', '晚上 21:00 修道院外墙有免费灯光秀（周一除外，请确认）'],
      tags: ['殖民小镇', '美食'], q: 'Valladolid Yucatan', cluster: 'valladolid' },
    { id: 'tulum-pueblo', zh: '图卢姆镇 & La Veleta', en: 'Tulum Pueblo', cat: 'town', lat: 20.211, lon: -87.465, drive: 70, hours: 2,
      cost: '免费',
      blurb: '图卢姆小镇中心和西边的 La Veleta 区是这几年餐厅、咖啡馆、手工艺店爆发的地方，比海滩区便宜一半。',
      tips: ['适合在遗址 + 天然井之后吃晚饭再回酒店', 'Taquería Honorio 的早餐 taco 是当地传奇'],
      tags: ['晚餐', '咖啡'], q: 'Tulum Centro', cluster: 'tulum' },
    { id: 'puerto-morelos', zh: '莫雷洛斯港渔村', en: 'Puerto Morelos', cat: 'town', lat: 20.8478, lon: -86.8755, drive: 30, hours: 3,
      cost: '礁石浮潜团约 US$ 40/人',
      blurb: '酒店往北 30 分钟的小渔村，有一座歪斜的灯塔和墨西哥第二大堡礁的近岸段，浮潜船 10 分钟就到礁区。镇上海鲜便宜地道。',
      tips: ['与天然井之路同一天', '11/25 航班 16:00 起飞：11 点退房后来这里吃午饭，13:00 出发去机场（25 分钟）刚好'],
      tags: ['海鲜', '顺路机场'], q: 'Puerto Morelos', cluster: 'puerto-morelos' },

    { id: 'punta-laguna', zh: '蜘蛛猴保护区', en: 'Punta Laguna · Otoch Ma\'ax Yetel Kooh', cat: 'nature', lat: 20.645, lon: -87.63, drive: 110, hours: 3,
      cost: '步道约 MXN 200 · 含向导和划船约 MXN 500 · 现金',
      blurb: '玛雅社区管理的丛林保护区，跟着当地向导找蜘蛛猴和吼猴，然后在湖上划独木舟、玩一条滑索，最后参加一个简短的玛雅祈福仪式。',
      tips: ['每天 7:00–17:00；猴子清晨和下午 15 点前后最活跃', '与科巴同一天（相距 30 分钟）'],
      tags: ['猴子', '社区'], link: 'https://puntalagunamx.com', q: 'Punta Laguna Reserva', cluster: 'coba' },
    { id: 'bull-shark', zh: '普拉亚卡门公牛鲨潜水', en: 'Bull Shark Dive', cat: 'nature', lat: 20.62, lon: -87.06, drive: 15, hours: 3,
      cost: '约 US$ 120–150/人 · 需进阶 (AOW) 潜水证',
      blurb: '每年 11 月到 3 月，怀孕的雌性公牛鲨会聚集到普拉亚卡门外海 25 米深的沙地，潜水员跪在沙地上看它们从眼前游过。你们去的时候正好是季节开始。',
      tips: ['需进阶开放水域 (AOW) 潜水证', 'Phantom Divers、Phocea 等潜店每天出海'],
      tags: ['需潜水证', '当季'], q: 'Phantom Divers Playa del Carmen', cluster: 'playa' },

    { id: 'resort', zh: '酒店半天（泳池 / 海滩 / SPA）', en: 'Impression Moxche by Secrets', cat: 'rest', lat: 20.705, lon: -86.957, drive: 0, hours: 4,
      cost: '已含在房费',
      blurb: '空着的日子就是整天在酒店，不用加这张卡。它用来表示「半天在酒店、半天出门」：排在出门项目前面就是上午泡酒店、下午出门，排在后面反之。',
      tips: ['提前预约特色餐厅和 SPA', '早起去海滩看日出（加勒比海朝东）'],
      tags: ['半天'], q: 'Impression Moxche by Secrets', cluster: 'hotel' },
    ...HOTEL_ITEMS.map(h => Object.assign({ cat: 'rest', drive: 0, lat: HOTEL.lat, lon: HOTEL.lon, cluster: 'hotel', tips: [] }, h)),
  ];
  // light = all-inclusive pace: three outings, every other day at the resort; full = see as much as possible
  const SUGGEST = {
    light: {
      '2026-11-20': ['h-ember', 'h-theatre'],
      '2026-11-21': ['h-sunrise', 'h-hydro', 'h-rooftop', 'h-dos-almas'],
      '2026-11-22': ['rio-secreto', 'h-seasoul', 'h-teodoro'],
      '2026-11-23': ['h-watersports', 'h-cenote-pools', 'quinta'],
      '2026-11-24': ['tulum-ruins', 'taak-bi-ha', 'h-suki'],
      '2026-11-25': [],
    },
    full: {
      '2026-11-20': ['quinta'],
      '2026-11-21': ['tulum-ruins', 'dos-ojos', 'taak-bi-ha', 'tulum-pueblo'],
      '2026-11-22': ['rio-secreto', 'xpuha', 'h-teodoro'],
      '2026-11-23': ['chichen', 'suytun', 'valladolid'],
      '2026-11-24': ['resort', 'xplor-fuego'],
      '2026-11-25': ['puerto-morelos'],
    },
  };
  const PRESET_NAME = { light: '酒店为主', full: '多出去玩' };
  const byId = Object.fromEntries(SITES.map(s => [s.id, s]));

  // ---------- state ----------
  const LS_PLAN = 'riviera-plan-v1', LS_UI = 'riviera-ui-v1';
  const emptyPlan = () => ({ days: Object.fromEntries(DAYS.map(d => [d.key, []])), notes: {}, meta: {}, updatedAt: 0 });
  const normalize = raw => {
    const p = emptyPlan();
    if (raw && typeof raw === 'object') {
      for (const d of DAYS) {
        const arr = raw.days && Array.isArray(raw.days[d.key]) ? raw.days[d.key] : [];
        p.days[d.key] = arr.filter(id => byId[id]).filter((id, i, a) => a.indexOf(id) === i);
        if (raw.notes && typeof raw.notes[d.key] === 'string') p.notes[d.key] = raw.notes[d.key].slice(0, 2000);
        const m = raw.meta && raw.meta[d.key];
        if (m && typeof m === 'object') p.meta[d.key] = { updatedAt: Number(m.updatedAt) || 0, updatedBy: typeof m.updatedBy === 'string' ? m.updatedBy : null };
      }
      p.updatedAt = Number(raw.updatedAt) || 0;
    }
    return p;
  };
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };

  let plan = normalize(lsGet(LS_PLAN));
  let ui = Object.assign({ cat: 'all', sort: 'cat', unplanned: false, half: false, eve: false, open: null }, lsGet(LS_UI) || {});
  let db = null, userNs = null, roomNs = null, myId = null, dbReadOnly = false, saveTimer = null, toastTimer = null;

  const $ = sel => document.querySelector(sel);
  const el = (tag, attrs, html) => { const n = document.createElement(tag); if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]); if (html != null) n.innerHTML = html; return n; };
  const fmtDrive = m0 => { const m = Math.round(m0 / 5) * 5; return m === 0 ? '在酒店' : m < 60 ? `${m} 分钟` : `${Math.floor(m / 60)} 小时${m % 60 ? ' ' + (m % 60) + ' 分' : ''}`; };
  const fmtHours = h => Number.isInteger(h) ? `${h} 小时` : `${h} 小时`.replace('.5', '½');
  const km = (a, b) => { const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s)); };
  const plannedDays = id => DAYS.filter(d => plan.days[d.key].includes(id));
  // door-to-door hours for one outing: time on site plus the drive both ways, rounded to the half hour
  const outing = s => Math.round((s.hours + s.drive * 2 / 60) * 2) / 2;
  const isHalf = s => s.drive > 0 && outing(s) <= 5.5;

  // ---------- cloud (Firebase): email login, trip members, one document per day, presence ----------
  // Replaces the Claude-artifact persistence layer. Everything above this block is shared with the artifact page.
  function setSync(mode, text) { const s = $('#sync'); if (s) { s.className = 'sync ' + mode; s.textContent = text; } }
  const daySig = k => JSON.stringify([plan.days[k], plan.notes[k] || '']);
  const lastSig = {}; DAYS.forEach(d => { lastSig[d.key] = daySig(d.key); });
  const dirty = new Set();
  function commit() {
    const now = Date.now();
    for (const d of DAYS) { const sig = daySig(d.key); if (sig !== lastSig[d.key]) { lastSig[d.key] = sig; plan.meta[d.key] = { updatedAt: now, updatedBy: myId }; dirty.add(d.key); } }
    plan.updatedAt = now;
    lsSet(LS_PLAN, plan);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushDirty, 600);
  }
  let fbAuth = null, me = null, myEmail = null, tripId = null, tripDoc = null, unsubDays = null, unsubTrip = null, unsubPresence = null, presenceTimer = null;
  const cloudReady = () => !!(db && tripId && me);
  const writing = new Set(), queued = new Set();
  async function pushDay(key) {
    if (!cloudReady() || dbReadOnly) return;
    if (writing.has(key)) { queued.add(key); return; }
    writing.add(key);
    const meta = plan.meta[key] || {};
    const body = { items: [...plan.days[key]], note: plan.notes[key] || '', updatedAt: meta.updatedAt || Date.now(), updatedBy: meta.updatedBy || myEmail || null };
    try { await setDoc(doc(db, 'trips', tripId, 'days', key), body); dirty.delete(key); setSync('cloud', '已同步到云端'); }
    catch (e) {
      if (e && e.code === 'permission-denied') { dbReadOnly = true; setSync('local', '没有这份行程的编辑权限 · 改动只保存在本机'); }
      else setSync('cache', '云端暂时无法保存 · 已存本机');
    }
    writing.delete(key);
    if (queued.has(key)) { queued.delete(key); pushDay(key); }
  }
  function pushDirty() { for (const k of [...dirty]) pushDay(k); }
  // returns true when the local plan changed
  function applyRemoteDay(key, data) {
    const items = Array.isArray(data.items) ? data.items.filter(id => byId[id]).filter((id, i, a) => a.indexOf(id) === i) : [];
    const note = typeof data.note === 'string' ? data.note.slice(0, 2000) : '';
    const updatedAt = Number(data.updatedAt) || 0, updatedBy = typeof data.updatedBy === 'string' ? data.updatedBy : null;
    const localAt = (plan.meta[key] && plan.meta[key].updatedAt) || 0;
    if (updatedAt < localAt) { if (!dbReadOnly) dirty.add(key); return false; }   // ours is newer: it will be pushed
    const same = daySig(key) === JSON.stringify([items, note]);
    plan.meta[key] = { updatedAt, updatedBy };
    if (same) return false;
    plan.days[key] = items; plan.notes[key] = note; lastSig[key] = daySig(key); dirty.delete(key);
    return true;
  }
  const authMsg = e => ({
    'auth/invalid-credential': '邮箱或密码不对。第一次使用请点「注册新账号」。',
    'auth/wrong-password': '密码不对。',
    'auth/user-not-found': '这个邮箱还没注册，点「注册新账号」。',
    'auth/email-already-in-use': '这个邮箱已经注册过了，直接登录即可。',
    'auth/weak-password': '密码至少 6 位。',
    'auth/invalid-email': '邮箱格式不对。',
    'auth/too-many-requests': '尝试太多次了，稍后再试。',
    'auth/network-request-failed': '网络不通，稍后再试。',
  })[e && e.code] || (e && e.message) || '出错了';
  const configured = () => !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
  function connectCloud() {
    renderShare();
    if (!configured()) { setSync('local', '云端未配置 · 保存在这台设备'); return; }
    try { const app = initializeApp(firebaseConfig); fbAuth = getAuth(app); db = getFirestore(app); }
    catch (e) { setSync('local', 'Firebase 配置有误 · 保存在这台设备'); return; }
    onAuthStateChanged(fbAuth, async user => {
      me = user; myEmail = user && user.email ? user.email.toLowerCase() : null; myId = myEmail;
      if (user) { try { await openTrip(); } catch (e) { setSync('local', '打开云端行程失败 · ' + (e.code || e.message || '')); } }
      else { closeTrip(); setSync('local', '未登录 · 保存在这台设备'); }
      renderShare();
    });
    $('#login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#login-email').value.trim(), pass = $('#login-pass').value;
      try { await signInWithEmailAndPassword(fbAuth, email, pass); toast('已登录'); } catch (err) { toast(authMsg(err)); }
    });
    $('#invite-form').addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#invite-email').value.trim().toLowerCase(); if (!email || !tripId) return;
      if (((tripDoc && tripDoc.members) || []).includes(email)) { toast('这个邮箱已经是成员了'); return; }
      try {
        await updateDoc(doc(db, 'trips', tripId), { members: arrayUnion(email) });
        await setDoc(doc(db, 'invites', email), { trips: arrayUnion(tripId) }, { merge: true });
        $('#invite-email').value = ''; toast(`已邀请 ${email}，对方用这个邮箱注册登录即可`);
      } catch (err) { toast('邀请失败：' + (err.code || err.message)); }
    });
    document.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
      if (a === 'signup') {
        const email = $('#login-email').value.trim(), pass = $('#login-pass').value;
        if (!email || pass.length < 6) { toast('填好邮箱和至少 6 位的密码再点注册'); return; }
        try { await createUserWithEmailAndPassword(fbAuth, email, pass); toast('注册成功，已登录'); } catch (err) { toast(authMsg(err)); }
      } else if (a === 'reset-pass') {
        const email = $('#login-email').value.trim(); if (!email) { toast('先填邮箱'); return; }
        try { await sendPasswordResetEmail(fbAuth, email); toast('重置密码的邮件已发出，请查收'); } catch (err) { toast(authMsg(err)); }
      } else if (a === 'signout') {
        try { await signOut(fbAuth); toast('已退出'); } catch (err) { toast(authMsg(err)); }
      } else if (a === 'remove-member') {
        const email = b.dataset.email; if (!email || !tripId) return;
        try { await updateDoc(doc(db, 'trips', tripId), { members: arrayRemove(email) }); toast(`已移除 ${email}`); } catch (err) { toast('移除失败：' + (err.code || err.message)); }
      }
    });
  }
  async function openTrip() {
    closeTrip();
    // invites/<email> lists the trips this email was added to; the trip's own members list is what grants access
    const invRef = doc(db, 'invites', myEmail);
    let ids = [];
    try { const inv = await getDoc(invRef); if (inv.exists() && Array.isArray(inv.data().trips)) ids = inv.data().trips; } catch (e) { /* none yet */ }
    let found = null;
    for (const id of ids) { try { const t = await getDoc(doc(db, 'trips', id)); if (t.exists() && (t.data().members || []).includes(myEmail)) { found = t; break; } } catch (e) { /* not a member any more */ } }
    if (found) tripId = found.id;
    else {
      const ref = await addDoc(collection(db, 'trips'), { name: '里维埃拉玛雅 2026.11.20–25', ownerUid: me.uid, ownerEmail: myEmail, members: [myEmail], createdAt: Date.now() });
      await setDoc(invRef, { trips: arrayUnion(ref.id) }, { merge: true });
      tripId = ref.id;
    }
    dbReadOnly = false;
    unsubTrip = onSnapshot(doc(db, 'trips', tripId), s => { tripDoc = s.exists() ? s.data() : null; renderShare(); }, () => {});
    let first = true;
    const timer = setTimeout(() => setSync('cache', '云端连接慢 · 先用本机版本'), 10000);
    unsubDays = onSnapshot(collection(db, 'trips', tripId, 'days'), qs => {
      if (!qs.metadata.fromCache) clearTimeout(timer);
      let changed = false;
      qs.docs.forEach(d => { if (plan.days[d.id] !== undefined) changed = applyRemoteDay(d.id, d.data() || {}) || changed; });
      if (changed) { lsSet(LS_PLAN, plan); renderAll(); }
      if (first && !qs.metadata.fromCache) {   // days only this device knows about go up once
        first = false;
        for (const x of DAYS) { if (!qs.docs.some(d => d.id === x.key) && (plan.days[x.key].length || plan.notes[x.key])) { plan.meta[x.key] = plan.meta[x.key] || { updatedAt: plan.updatedAt || Date.now(), updatedBy: myEmail }; dirty.add(x.key); } }
      }
      if (dirty.size && !dbReadOnly) { clearTimeout(saveTimer); saveTimer = setTimeout(pushDirty, 300); }
      setSync(qs.metadata.fromCache ? 'cache' : 'cloud', qs.metadata.fromCache ? '同步中…' : '已同步到云端');
    }, () => { clearTimeout(timer); setSync('local', '云端不可用 · 保存在这台设备'); });
    const pRef = doc(db, 'trips', tripId, 'presence', me.uid);
    const beat = () => { if (document.visibilityState === 'visible') setDoc(pRef, { email: myEmail, lastSeen: Date.now() }).catch(() => {}); };
    beat(); presenceTimer = setInterval(beat, 30000);
    unsubPresence = onSnapshot(collection(db, 'trips', tripId, 'presence'), qs => {
      const now = Date.now();
      renderPeers(qs.docs.map(d => d.data()).filter(p => p && p.email !== myEmail && now - (p.lastSeen || 0) < 90000));
    }, () => {});
  }
  function closeTrip() {
    if (unsubDays) unsubDays(); if (unsubTrip) unsubTrip(); if (unsubPresence) unsubPresence();
    clearInterval(presenceTimer); unsubDays = unsubTrip = unsubPresence = null; tripId = null; tripDoc = null; renderPeers([]);
  }
  function renderPeers(others) {
    const box = $('#peers'); if (!box) return;
    if (!others.length) { box.textContent = ''; box.hidden = true; return; }
    box.hidden = false; box.textContent = '';
    const lead = document.createElement('span'); lead.textContent = '👀 正在一起看：'; box.appendChild(lead);
    others.forEach(p => { const chip = document.createElement('span'); chip.className = 'peer'; chip.textContent = (p.email || '同伴').split('@')[0]; box.appendChild(chip); });
  }
  function renderShare() {
    const st = $('#auth-status'), lf = $('#login-form'), ai = $('#auth-in'); if (!st) return;
    if (!configured()) { st.textContent = '云端登录还没配置。按 README 填好 firebase-config.js 之后，这里就能用邮箱登录、邀请朋友。现在改动只保存在这台设备。'; lf.hidden = true; ai.hidden = true; return; }
    if (!me) { st.textContent = '用邮箱登录后，两个人可以共同编辑同一份行程。'; lf.hidden = false; ai.hidden = true; return; }
    st.textContent = `已登录：${myEmail}`; lf.hidden = true; ai.hidden = false;
    const mem = $('#members'); mem.textContent = '';
    const members = (tripDoc && Array.isArray(tripDoc.members)) ? tripDoc.members : [myEmail];
    const isOwner = !!(tripDoc && tripDoc.ownerUid === me.uid);
    members.forEach(m => {
      const chip = document.createElement('span'); chip.className = 'member';
      const t = document.createElement('span'); t.textContent = m === myEmail ? `${m}（你）` : m; chip.appendChild(t);
      if (isOwner && m !== myEmail) { const x = document.createElement('button'); x.type = 'button'; x.dataset.act = 'remove-member'; x.dataset.email = m; x.setAttribute('aria-label', '移除'); x.textContent = '✕'; chip.appendChild(x); }
      mem.appendChild(chip);
    });
  }
  function timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts; if (diff < 60e3) return '刚刚'; if (diff < 3600e3) return `${Math.round(diff / 60e3)} 分钟前`;
    const d = new Date(ts), now = new Date(); const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    return d.toDateString() === now.toDateString() ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  }
  function fillNames() {
    document.querySelectorAll('.who[data-ts]').forEach(e => {
      const uid = e.dataset.uid; const t = timeAgo(+e.dataset.ts);
      const who = !uid ? '' : uid === myEmail ? '你' : uid.split('@')[0];
      e.textContent = who ? `${who}改于 ${t}` : `改于 ${t}`;
    });
  }

  // ---------- map ----------
  const B = { lonMin: -88.75, lonMax: -86.55, latMin: 19.95, latMax: 21.70 }, MW = 820, MH = 690;
  const P = (lat, lon) => [((lon - B.lonMin) / (B.lonMax - B.lonMin) * MW).toFixed(1), ((B.latMax - lat) / (B.latMax - B.latMin) * MH).toFixed(1)];
  const poly = pts => pts.map(p => P(p[0], p[1]).join(',')).join(' ');
  function renderMap() {
    const coastN = [[21.70, -88.75], [21.62, -88.60], [21.60, -88.20], [21.55, -87.95], [21.48, -87.70], [21.45, -87.45], [21.50, -87.25], [21.60, -87.08]];
    const coastE = [[21.52, -86.95], [21.45, -86.80], [21.25, -86.76], [21.14, -86.74], [21.03, -86.78], [20.93, -86.83], [20.85, -86.87], [20.76, -86.93], [20.70, -86.96], [20.63, -87.07], [20.58, -87.12], [20.50, -87.23], [20.39, -87.31], [20.32, -87.36], [20.21, -87.43], [20.10, -87.46], [19.95, -87.47], [19.95, -88.75]];
    const cozumel = [[20.59, -86.75], [20.52, -86.80], [20.42, -86.86], [20.30, -86.96], [20.27, -87.00], [20.32, -87.03], [20.42, -87.00], [20.51, -86.96], [20.57, -86.84]];
    const holbox = [[21.52, -87.42], [21.54, -87.28], [21.56, -87.15]];
    const mujeres = [[21.27, -86.75], [21.20, -86.72]];
    const road180 = [[21.05, -86.85], [20.98, -87.20], [20.90, -87.60], [20.78, -88.00], [20.72, -88.20], [20.69, -88.45], [20.68, -88.57]];
    const roadCoba = [[20.21, -87.46], [20.35, -87.60], [20.49, -87.73], [20.60, -87.95], [20.69, -88.20]];
    const labels = [[21.16, -86.85, '坎昆', 1], [20.63, -87.12, '普拉亚卡门', 1], [20.21, -87.50, '图卢姆', 1], [20.49, -87.80, '科巴', 0], [20.69, -88.26, '巴利亚多利德', 0], [20.68, -88.62, '奇琴伊察', 0], [20.42, -86.80, '科苏梅尔', 0], [21.62, -87.66, '霍尔博克斯', 0], [21.25, -86.68, '女人岛', 0], [20.85, -86.84, '莫雷洛斯港', 0]];
    let svg = `<svg viewBox="0 0 ${MW} ${MH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="周边景点示意图">`;
    svg += `<polygon class="m-land" points="${poly([...coastN, ...coastE])}"/>`;
    svg += `<polygon class="m-land" points="${poly(cozumel)}"/>`;
    svg += `<polyline class="m-land" points="${poly(holbox)}" stroke-width="5" stroke-linecap="round"/>`;
    svg += `<polyline class="m-land" points="${poly(mujeres)}" stroke-width="4" stroke-linecap="round"/>`;
    svg += `<polyline class="m-road" points="${poly(road180)}"/><polyline class="m-road" points="${poly(roadCoba)}"/>`;
    for (const [lat, lon, t, big] of labels) { const [x, y] = P(lat, lon); svg += `<text class="m-label${big ? ' big' : ''}" x="${x}" y="${y}" text-anchor="${lon < -87.9 || lon > -86.9 && lat > 21 ? 'end' : 'start'}" dy="${big ? -10 : 14}">${t}</text>`; }
    for (const s of SITES) { if (!s.drive) continue; const [x, y] = P(s.lat, s.lon);
      svg += `<circle class="m-dot" data-id="${s.id}" cx="${x}" cy="${y}" r="5.5" fill="${CATS[s.cat].color}"><title>${s.zh} · 车程 ${fmtDrive(s.drive)}</title></circle>`; }
    const [hx, hy] = P(HOTEL.lat, HOTEL.lon);
    svg += `<path class="m-hotel" transform="translate(${hx} ${hy})" d="M0,-9 L2.6,-2.8 L9,-2.8 L3.8,1.2 L5.6,7.6 L0,3.8 L-5.6,7.6 L-3.8,1.2 L-9,-2.8 L-2.6,-2.8 Z"><title>酒店 · Impression Moxche</title></path>`;
    svg += `<text class="m-label big" x="${hx}" y="${hy}" dx="12" dy="4">酒店</text>`;
    svg += `<g id="m-tip" style="display:none"><rect class="m-tip-bg" rx="4" height="20"/><text class="m-tip" dy="14" dx="6"></text></g>`;
    svg += `</svg>`;
    $('#map').innerHTML = svg;
    $('#legend').innerHTML = Object.entries(CATS).filter(([k]) => k !== 'rest').map(([k, c]) => `<span style="--c:${c.color}">${c.label}</span>`).join('') + '<span style="--c:var(--sun)">★ 酒店</span>';
    const tip = $('#m-tip');
    $('#map').addEventListener('pointerover', e => { const d = e.target.closest('.m-dot'); if (!d) return; const s = byId[d.dataset.id];
      const t = tip.querySelector('text'); t.textContent = `${s.zh} · ${fmtDrive(s.drive)}`; tip.style.display = '';
      const w = t.getComputedTextLength() + 12; const x = Math.min(parseFloat(d.getAttribute('cx')) + 10, MW - w - 4), y = parseFloat(d.getAttribute('cy')) - 26;
      tip.querySelector('rect').setAttribute('width', w); tip.setAttribute('transform', `translate(${x} ${Math.max(y, 2)})`); });
    $('#map').addEventListener('pointerout', e => { if (e.target.closest('.m-dot')) tip.style.display = 'none'; });
  }
  function refreshMapDots() { document.querySelectorAll('.m-dot').forEach(d => d.classList.toggle('planned', plannedDays(d.dataset.id).length > 0)); }

  // ---------- catalog ----------
  function renderFilters() {
    const f = $('#filters');
    const chips = [['all', '全部', null], ...Object.entries(CATS).map(([k, c]) => [k, c.label, c.color])];
    f.innerHTML = chips.map(([k, label, color]) => `<button class="chip" data-act="cat" data-cat="${k}" aria-pressed="${ui.cat === k}" ${color ? `style="--c:${color}"` : ''}>${color ? '<span class="sw"></span>' : ''}${label}</button>`).join('')
      + `<span class="spacer"></span>
         <button class="chip toggle" data-act="flag" data-flag="half" aria-pressed="${ui.half}">⏱ 半天可回酒店</button>
         <button class="chip toggle" data-act="flag" data-flag="eve" aria-pressed="${ui.eve}">🌙 傍晚出发</button>
         <button class="chip toggle" data-act="flag" data-flag="unplanned" aria-pressed="${ui.unplanned}">只看未安排</button>
         <select id="f-sort" aria-label="排序"><option value="drive" ${ui.sort === 'drive' ? 'selected' : ''}>按车程</option><option value="cat" ${ui.sort === 'cat' ? 'selected' : ''}>按类别</option><option value="hours" ${ui.sort === 'hours' ? 'selected' : ''}>按所需时间</option></select>`;
  }
  function visibleSites() {
    let list = SITES.filter(s => ui.cat === 'all' || s.cat === ui.cat);
    if (ui.unplanned) list = list.filter(s => plannedDays(s.id).length === 0);
    if (ui.half) list = list.filter(isHalf);
    if (ui.eve) list = list.filter(s => s.slot === 'eve' && s.drive > 0);
    const order = Object.keys(CATS);
    if (ui.sort === 'drive') list.sort((a, b) => a.drive - b.drive);
    else if (ui.sort === 'hours') list.sort((a, b) => a.hours - b.hours);
    else list.sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat) || a.drive - b.drive);
    return list;
  }
  function cardHtml(s) {
    const c = CATS[s.cat]; const pd = plannedDays(s.id);
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.q || s.en)}`;
    const open = ui.open === s.id;
    return `<article class="card" id="card-${s.id}" style="--c:${c.color}">
      <div class="top"><div><div class="cat">${c.label}</div><h3>${s.zh}</h3><div class="en">${s.en}</div></div>
        <div class="planned-badges">${pd.map(d => `<span class="pbadge">${d.md}</span>`).join('')}</div></div>
      <div class="meta"><span>🚗 车程 <b>${fmtDrive(s.drive)}</b></span><span>⏱ 约 <b>${fmtHours(s.hours)}</b></span>${s.drive ? `<span>🏨 来回共 <b>${fmtHours(outing(s))}</b></span>` : ''}</div>
      <div class="meta"><span>💵 <b style="font-weight:400">${s.cost}</b></span></div>
      <p class="blurb">${s.blurb}</p>
      <div class="tagrow">${isHalf(s) ? '<span class="tag good">半天往返</span>' : ''}${s.slot === 'eve' && s.drive > 0 ? '<span class="tag good">傍晚出发</span>' : ''}${(s.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}${s.closedNote ? `<span class="tag warn">${s.closedNote}</span>` : ''}${s.warn ? `<span class="tag warn">${s.warn}</span>` : ''}</div>
      <details class="more"><summary>详情 & 小贴士</summary><ul>${s.tips.map(t => `<li>${t}</li>`).join('')}</ul></details>
      <div class="foot">
        <div class="links">${s.link ? `<a href="${s.link}" target="_blank" rel="noopener">官网 ↗</a>` : ''}${s.drive ? `<a href="${maps}" target="_blank" rel="noopener">地图 ↗</a>` : '<span style="color:var(--muted)">酒店内 · 找管家预订</span>'}</div>
        <button class="add" data-act="pick" data-id="${s.id}" aria-expanded="${open}">${pd.length ? '调整日期' : '＋ 加入行程'}</button>
      </div>
      ${open ? `<div class="daypick" role="group" aria-label="选择日期">${DAYS.map(d => { const on = plan.days[d.key].includes(s.id); const shut = s.closed && s.closed.includes(d.wd);
        return `<button data-act="toggle" data-id="${s.id}" data-day="${d.key}" aria-pressed="${on}" title="${shut ? s.closedNote : ''}"><span class="d">${d.md}</span><span class="w">${d.dow}${d.tag ? ' · ' + d.tag : shut ? ' · 休' : ''}</span></button>`; }).join('')}</div>` : ''}
    </article>`;
  }
  function renderCards() {
    const list = visibleSites();
    $('#cards').innerHTML = list.length ? list.map(cardHtml).join('') : `<div class="empty">这个筛选下没有景点了。</div>`;
    $('#count-hint').textContent = `${list.length} / ${SITES.length}`;
  }

  // ---------- planner ----------
  function dayStats(d) {
    const ids = plan.days[d.key]; const sites = ids.map(id => byId[id]);
    const out = sites.filter(s => s.drive > 0);   // in-hotel items (drive 0) never count as an outing
    if (!sites.length) return { hours: 0, travel: 0, total: 0, out: 0, warns: [] };
    const onsite = out.reduce((a, s) => a + s.hours, 0);
    let travel = 0, maxGap = 0;
    if (out.length) {
      travel = out[0].drive + out[out.length - 1].drive;
      for (let i = 1; i < out.length; i++) { const dist = km(out[i - 1], out[i]); travel += dist * 1.3 / 55 * 60; }
      for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) maxGap = Math.max(maxGap, km(out[i], out[j]));
    }
    const total = onsite + travel / 60;
    const warns = [];
    if (out.length && total > d.cap) warns.push({ bad: total > d.cap + 3, text: d.tag === '抵达日' ? '抵达日 15:00 才入住，这天只适合傍晚去一个近的地方' : d.tag === '退房日' ? '退房日 16:00 起飞，12:45 前得出发去机场，只够顺路停一处' : `这一天约 ${total.toFixed(0)} 小时太满了，建议减到 ${d.cap} 小时以内` });
    if (maxGap > 90) warns.push({ bad: false, text: '当天景点之间相距超过 90 公里，路上会很赶' });
    for (const s of sites) { if (s.closed && s.closed.includes(d.wd)) warns.push({ bad: true, text: `${s.zh}：${s.closedNote || '这天不开放'}` }); }
    const dinners = sites.filter(s => s.meal === 'dinner').length; if (dinners > 1) warns.push({ bad: false, text: `这天排了 ${dinners} 顿晚餐，留一顿就好` });
    const lunches = sites.filter(s => s.meal === 'lunch').length; if (lunches > 1) warns.push({ bad: false, text: `这天排了 ${lunches} 顿午餐` });
    if (out.length && total > 7 && sites.some(s => s.meal === 'dinner')) warns.push({ bad: false, text: '外出时间长，晚餐预订时间别订太早' });
    if (d.wd === 0 && sites.some(s => s.cat === 'ruin')) warns.push({ bad: false, text: '周日墨西哥居民免费参观遗址，人会非常多，建议换一天' });
    if (sites.some(s => s.id === 'rio-secreto') && (d.wd === 0 || d.wd === 6)) warns.push({ bad: false, text: 'Río Secreto 周末只有 9/11/13 点三场，记得提前订' });
    return { hours: onsite, travel, total, out: out.length, warns };
  }
  function blankText(d) {
    if (d.tag === '抵达日') return '13:21 落地，约 15:00 到酒店入住，安顿、看日落、吃晚餐。想出门就在景点卡片点「＋ 加入行程」。';
    if (d.tag === '退房日') return '早餐后收拾，11:00 退房，12:45 前出发去机场赶 16:00 的航班。想顺路停一处可以加莫雷洛斯港。';
    return '这一天整天在酒店 🏖 泳池、海滩、SPA、餐厅都已包含。想出门就在景点卡片点「＋ 加入行程」。';
  }
  function mealHint(total) {
    if (total <= 5.5) return '🏨 半天往返，回酒店吃午饭或晚饭';
    if (total <= 9) return `🏨 外出约 ${total.toFixed(0)} 小时，会错过酒店的一顿正餐`;
    return '🏨 全天在外，酒店的午餐和晚餐都会错过';
  }
  function nearbyFor(d) {
    const ids = plan.days[d.key]; if (!ids.length) return [];
    const clusters = new Set(ids.map(id => byId[id].cluster));
    return SITES.filter(s => !ids.includes(s.id) && clusters.has(s.cluster) && s.cluster !== 'hotel' && plannedDays(s.id).length === 0 && !(s.closed && s.closed.includes(d.wd))).slice(0, 3);
  }
  function renderPlanner() {
    const total = DAYS.reduce((a, d) => a + plan.days[d.key].length, 0);
    $('#seg-count').textContent = total ? total : '';
    const outDays = DAYS.filter(d => plan.days[d.key].some(id => byId[id].drive > 0)).length;
    $('#plan-sum').textContent = total ? `出门 ${outDays} 天 · 其余 ${DAYS.length - outDays} 天在酒店` : '还没排任何出门项目，六天都在酒店也挺好。';
    $('#days').innerHTML = DAYS.map(d => {
      const ids = plan.days[d.key]; const st = dayStats(d); const near = nearbyFor(d);
      return `<section class="day" aria-label="${d.md} ${d.dow}">
        <div class="day-head"><span class="date">${d.md}</span><span class="dow">${d.dow}</span>${d.tag ? `<span class="daytag">${d.tag}</span>` : ''}
          ${ids.length ? `<span class="load ${st.out && st.total > d.cap ? 'over' : ''}" title="含往返车程">${st.out ? `外出 ≈ ${st.total.toFixed(1)} h · 车程 ${Math.round(st.travel)} 分` : '整天在酒店'}</span>` : ''}
          ${plan.meta[d.key] && plan.meta[d.key].updatedAt ? `<span class="who" data-uid="${plan.meta[d.key].updatedBy || ''}" data-ts="${plan.meta[d.key].updatedAt}">改于 ${timeAgo(plan.meta[d.key].updatedAt)}</span>` : ''}</div>
        ${d.note ? `<div class="day-note">${d.note}</div>` : ''}
        ${ids.length ? `<ol class="items">${ids.map((id, i) => { const s = byId[id]; return `<li class="item" style="--c:${CATS[s.cat].color}">
            <span class="num">${i + 1}</span>
            <div style="min-width:0"><div class="n">${s.zh}</div><div class="m">${fmtDrive(s.drive)} · ${fmtHours(s.hours)}</div></div>
            <div class="ctl"><button data-act="move" data-day="${d.key}" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="上移">↑</button><button data-act="move" data-day="${d.key}" data-i="${i}" data-dir="1" ${i === ids.length - 1 ? 'disabled' : ''} aria-label="下移">↓</button><button class="x" data-act="remove" data-day="${d.key}" data-id="${id}" aria-label="移除">✕</button></div>
          </li>`; }).join('')}</ol>`
          : `<div class="blank">${blankText(d)}</div>`}
        ${st.out && !d.tag ? `<div class="meal">${mealHint(st.total)}</div>` : ''}
        ${st.warns.length ? `<div class="warns">${st.warns.map(w => `<div class="warn ${w.bad ? 'bad' : ''}">⚠ <span>${w.text}</span></div>`).join('')}</div>` : ''}
        ${near.length ? `<div class="nearby">顺路还可以加：${near.map(s => `<button data-act="quick" data-id="${s.id}" data-day="${d.key}">+ ${s.zh}</button>`).join('')}</div>` : ''}
        <textarea id="note-${d.key}" data-day="${d.key}" rows="1" placeholder="备注：租车、餐厅、预订号、出发时间…">${(plan.notes[d.key] || '').replace(/</g, '&lt;')}</textarea>
      </section>`;
    }).join('');
    fillNames();
    refreshCodeOut();
  }
  function renderAll() { renderCards(); renderPlanner(); refreshMapDots(); }

  // ---------- actions ----------
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800); }
  function copyText(text, okMsg) {
    const done = () => toast(okMsg);
    const fallback = () => { const ta = el('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择文字'); } ta.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  function planText() {
    const lines = ['🌴 里维埃拉玛雅行程 2026.11.20–11.25', '🏨 Impression Moxche by Secrets · Carr. Cancún-Tulum km 294, Corasol, Playa del Carmen', ''];
    for (const d of DAYS) {
      const ids = plan.days[d.key]; lines.push(`${d.md} ${d.dow}${d.tag ? '（' + d.tag + '）' : ''}`);
      if (!ids.length) lines.push('  （未安排）');
      ids.forEach((id, i) => { const s = byId[id]; lines.push(`  ${i + 1}. ${s.zh} ${s.en} · 车程${fmtDrive(s.drive)} · ${fmtHours(s.hours)}`); });
      if (plan.notes[d.key]) lines.push(`  📝 ${plan.notes[d.key]}`);
      lines.push('');
    }
    lines.push('— 行程码（对方在页面点「行程码 → 粘贴 → 导入」即可同步，不用登录）：', encodePlan());
    return lines.join('\n');
  }
  // ---------- 行程码: the whole plan as one pasteable string, for friends who never sign in ----------
  const b64e = s => btoa(Array.from(new TextEncoder().encode(s), c => String.fromCharCode(c)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0)));
  function encodePlan() {
    const d = {}, n = {};
    for (const k of DAYS) { const s = k.key.slice(5); if (plan.days[k.key].length) d[s] = plan.days[k.key]; if (plan.notes[k.key]) n[s] = plan.notes[k.key]; }
    return 'RM1-' + b64e(JSON.stringify({ d, n }));
  }
  function decodePlan(code) {
    const m = String(code || '').trim().match(/RM1-([A-Za-z0-9_-]+)/); if (!m) return null;
    try {
      const o = JSON.parse(b64d(m[1])); const p = emptyPlan();
      for (const k of DAYS) { const s = k.key.slice(5);
        if (o.d && Array.isArray(o.d[s])) p.days[k.key] = o.d[s].filter(id => byId[id]).filter((id, i, a) => a.indexOf(id) === i);
        if (o.n && typeof o.n[s] === 'string') p.notes[k.key] = o.n[s].slice(0, 2000); }
      return p;
    } catch (e) { return null; }
  }
  function applyCode(p) { plan.days = p.days; plan.notes = p.notes; commit(); renderAll(); $('#code-in').value = ''; toast('已导入对方的行程'); }
  function refreshCodeOut() { const panel = $('#code-panel'), out = $('#code-out'); if (panel && out && !panel.hidden) out.value = encodePlan(); }
  function showConfirm(text, onYes) {
    $('#confirm-slot').innerHTML = `<div class="confirm"><span>${text}</span><span class="acts"><button class="btn" data-act="confirm-no">取消</button><button class="btn primary" data-act="confirm-yes">确定</button></span></div>`;
    $('#confirm-slot').querySelector('[data-act="confirm-yes"]').onclick = () => { $('#confirm-slot').innerHTML = ''; onYes(); };
    $('#confirm-slot').querySelector('[data-act="confirm-no"]').onclick = () => { $('#confirm-slot').innerHTML = ''; };
  }
  function applySuggest(preset) { const src = SUGGEST[preset] || SUGGEST.light; plan.days = Object.fromEntries(DAYS.map(d => [d.key, [...(src[d.key] || [])]])); commit(); renderAll();
    toast(preset === 'full' ? '已填入「多出去玩」，可以随意调整' : '已填入「酒店为主」：三次出门，其余在酒店'); }
  function setView(v) { $('#layout').classList.toggle('show-plan', v === 'plan'); $('#seg-sites').setAttribute('aria-pressed', v === 'sites'); $('#seg-plan').setAttribute('aria-pressed', v === 'plan'); }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'copy-addr') copyText($('#addr').textContent, '地址已复制');
    else if (a === 'view') { setView(b.dataset.view); window.scrollTo({ top: $('#layout').offsetTop - 8, behavior: 'smooth' }); }
    else if (a === 'cat') { ui.cat = b.dataset.cat; lsSet(LS_UI, ui); renderFilters(); renderCards(); }
    else if (a === 'flag') { const f = b.dataset.flag; ui[f] = !ui[f]; lsSet(LS_UI, ui); renderFilters(); renderCards(); }
    else if (a === 'pick') { ui.open = ui.open === b.dataset.id ? null : b.dataset.id; renderCards(); }
    else if (a === 'toggle') { const { id, day } = b.dataset; const arr = plan.days[day]; const i = arr.indexOf(id);
      if (i >= 0) { arr.splice(i, 1); toast(`已从 ${day.slice(5).replace('-', '/')} 移除`); } else { arr.push(id); toast(`已加入 ${day.slice(5).replace('-', '/')}`); }
      commit(); renderAll(); }
    else if (a === 'quick') { const { id, day } = b.dataset; if (!plan.days[day].includes(id)) { plan.days[day].push(id); commit(); renderAll(); toast(`已加入 ${byId[id].zh}`); } }
    else if (a === 'remove') { const { id, day } = b.dataset; plan.days[day] = plan.days[day].filter(x => x !== id); commit(); renderAll(); }
    else if (a === 'move') { const { day } = b.dataset; const i = +b.dataset.i, dir = +b.dataset.dir; const arr = plan.days[day]; const j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; commit(); renderPlanner(); }
    else if (a === 'suggest') { const preset = b.dataset.preset || 'light'; const has = DAYS.some(d => plan.days[d.key].length);
      if (has) showConfirm(`会覆盖现在的安排（备注会保留），确定填入「${PRESET_NAME[preset]}」？`, () => applySuggest(preset)); else applySuggest(preset); }
    else if (a === 'clear') { showConfirm('清空全部六天的安排？备注会保留。', () => { plan.days = emptyPlan().days; commit(); renderAll(); toast('已清空'); }); }
    else if (a === 'copy-plan') copyText(planText(), '行程文字已复制，可以直接粘贴到微信');
    else if (a === 'code') { const panel = $('#code-panel'); panel.hidden = !panel.hidden; b.setAttribute('aria-expanded', String(!panel.hidden)); refreshCodeOut(); }
    else if (a === 'copy-code') copyText(encodePlan(), '行程码已复制，发给对方粘贴导入');
    else if (a === 'import-code') { const p = decodePlan($('#code-in').value); if (!p) { toast('这不是有效的行程码，应以 RM1- 开头'); return; }
      const has = DAYS.some(d => plan.days[d.key].length); if (has) showConfirm('导入会覆盖这台设备上现在的安排，确定？', () => applyCode(p)); else applyCode(p); }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'f-sort') { ui.sort = e.target.value; lsSet(LS_UI, ui); renderCards(); }
  });
  let noteTimer = null;
  document.addEventListener('input', e => {
    const ta = e.target; if (!(ta.tagName === 'TEXTAREA' && ta.dataset.day)) return;
    plan.notes[ta.dataset.day] = ta.value.slice(0, 2000);
    clearTimeout(noteTimer); noteTimer = setTimeout(commit, 800);
  });
  document.addEventListener('click', e => {
    const dot = e.target.closest('.m-dot'); if (!dot) return;
    const id = dot.dataset.id;
    if (ui.cat !== 'all' && byId[id].cat !== ui.cat) { ui.cat = 'all'; lsSet(LS_UI, ui); renderFilters(); }
    if (ui.unplanned && plannedDays(id).length) { ui.unplanned = false; lsSet(LS_UI, ui); renderFilters(); }
    renderCards();
    setView('sites');
    const card = $('#card-' + id); if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
  });

  // ---------- boot ----------
  // on a phone the two big reference panels start collapsed so the list is one thumb-scroll away
  if (window.matchMedia && matchMedia('(max-width: 999px)').matches) document.querySelectorAll('.hotel-card, .map-card').forEach(d => d.removeAttribute('open'));
  renderMap(); renderFilters(); renderAll(); connectCloud();
