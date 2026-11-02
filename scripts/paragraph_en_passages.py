#!/usr/bin/env python3
"""Split shared English cloze/reading passages into paragraphs and attach one
Traditional Chinese translation per passage.

Only paragraph breaks are inserted. Joining the paragraphs with a single space
restores the original passage exactly. Cloze translations (and the parallel
`filled` paragraphs) use the passage after the correct answers are filled in.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUIZ = ROOT / 'data' / 'en' / 'quiz.json'
QUIZ_JS = ROOT / 'data' / 'en' / 'quiz-data.js'

# Each list is the opening of paragraphs 2..n. The first paragraph is everything before.
STARTS = {
    '100-p1': [
        'By 17, she was trying her hand as a club singer.',
        'In 1923, with ample funds from her rich boyfriends,',
        'By the 1920s, Chanel was one of the leading fashion designers',
    ],
    '100-p2': [
        'Since there is no boss around to supervise a SOHO worker,',
        'Many SOHO workers find it challenging to ignore the distractions',
        'Besides, though they enjoy more freedom and independence,',
    ],
    '101-p1': [
        '73 example is the symbol of Bluetooth,',
        'These examples 75 a very good question',
    ],
    '101-p2': [
        'Some visitors, however, want to stay longer',
        'Although the work is often hard and is in the sun,',
    ],
    '102-p1': [
        'Firstly, make sure you sleep well the night before,',
        'Drinks that contain lots of caffeine, like coffee and Red Bull,',
        'Even better, taking vitamin B tablets',
    ],
    '102-p2': [
        'The basic cause of dandruff is simple and unavoidable:',
        'Help is at hand, though, in the form of specially medicated',
    ],
    '103-p1': [
        'If you work in business,',
        'The point is you never know when you will be asked to speak',
    ],
    '103-p3': [
        'Another benefit of laughing is that it boosts the immune system',
        'In another study, nurses told jokes to some patients',
    ],
    '104-p1': [
        'By contrast, in North America, Europe, and Australia,',
        'But expectations vary from store to store',
    ],
    '104-p3': [
        'However, one thing the French cannot claim is the French fry.',
        'When American soldiers were stationing in Belgium during World War I,',
        'Not the British though.',
    ],
    '105-p1': [
        '______ to the public in 2011, Li-Fi is much faster than Wi-Fi.',
        '______ Wi-Fi’s radio waves, light cannot pass through walls.',
    ],
    '105-p2': [
        'Contrary to what most parents believe, many studies have shown',
        'Even though video games can actually be beneficial,',
    ],
    '106-p1': [
        'Therefore, 52 his students to the countryside',
        'This small success gave Yunus an idea.',
    ],
    '106-p2': [
        'This is an important discovery because lots of plastic gets dumped',
    ],
    '106-p3': [
        'The idea for Premium Friday was partly prompted by the suicide',
        "Japan's Prime Minister Shinzo Abe is leading by example.",
        'However, many workers said they would just have to work on Saturdays',
    ],
    '106-p5': [
        'Guide Dog Description:',
        'Potential Guide Dog Owners:',
        'Application Procedure:',
    ],
}

ZH = {
    '100-p1': [
        '可可．香奈兒，又名嘉柏麗．香奈兒，在成為時尚指標之前只是個小鎮女孩。小香奈兒在孤兒院長大，並在那裡第一次學會縫紉、做衣服。',
        '十七歲時，她試著當夜店歌手。然而，日後為她帶來名聲與財富的，不是她的嗓音，而是她對風格的敏銳眼光。',
        '一九二三年，靠著富有男友們提供的充裕資金，香奈兒在巴黎開創時尚事業。她的名聲迅速上升，不久之後便在法國各地以及海外開設店面。',
        '到了一九二〇年代，香奈兒憑藉才華與努力，成為領先的時裝設計師之一。她以簡潔優雅的設計重新定義女性時尚。她沒有去模仿競爭對手過度繁複的風格，而是把普通布料做成強調簡單與舒適的高雅服裝。',
    ],
    '100-p2': [
        '隨著數位科技發展，近二十年來 SOHO 族的人數增加了。SOHO 代表「小型辦公室／家庭辦公室」，指的是員工人數在一到十人的事業類型。任何人只要有電腦、傳真機，甚至一支電話，就能成為 SOHO 族，從事律師、網站設計師、作家或個人採買這類工作。',
        '由於身邊沒有老闆監督，SOHO 族必須獨立工作。沒有大公司那樣的資源，SOHO 族得比一般辦公室的員工更努力。因此，為了賺取最多利潤，SOHO 族必須確保自己的服務、點子或產品的品質。',
        '許多 SOHO 族覺得，要忽略家裡隨處等著讓人分心的事物並不容易。比方說，電視很難不看，他們也可能一直想去廚房或冰箱拿點心。',
        '此外，雖然他們享有更多自由與獨立，SOHO 族面對的工作壓力也更大。一方面，他們必須更有效率，才能趕上專案期限，否則可能有失去生意的風險。另一方面，他們的收入不固定，對需要養家的人造成很大壓力。總而言之，靠當 SOHO 族謀生，似乎並沒有想像中那麼容易。',
    ],
    '101-p1': [
        '今天世界上有許多符號，其中不少根源於歷史。舉例來說，@ 這個符號出現在世界上每一具鍵盤上。它的現代意義可以追溯到 1971 年，當時 Raymond Tomlinson 用它來辨識不同的電腦工作站。從此，它擴散到電子郵件、論壇、Facebook 和 Twitter。',
        '另一個例子是藍牙的符號，由瑞典公司易利信創造。這項技術其實是依照十世紀丹麥國王哈拉爾．藍牙（Harald Blatand）命名的；他曾把丹麥、挪威和瑞典統一成一個強大的王國。據說「藍牙」這個稱號的由來，是因為哈拉爾國王吃了太多藍莓。藍牙符號用的是哈拉爾姓名的首字母，並以該地區古老的盧恩文字寫成。',
        '這些例子引出一個很好的問題——如果沒有這些符號，我們會在哪裡？我們的世界肯定會看起來大不相同。',
    ],
    '101-p2': [
        '每年有超過四百萬名來自世界各地的遊客造訪澳洲。其中許多人只停留幾週，為的是參觀澳洲最大的城市雪梨，並享受澳洲美麗的海灘。',
        '然而，有些遊客想停留更久、體驗「真正的」澳洲，於是決定到豐收小徑（Harvest Trail）工作。豐收小徑是澳洲各地需要工人的一群農場。來自許多國家的遊客，不論男女，都可以當採果工人來支付旅費。這份工作能把他們帶到國內許多地方，從南方的塔斯馬尼亞到北方的昆士蘭。通常採收的水果包括櫻桃、芒果和桃子。',
        '雖然工作往往辛苦，而且是在大太陽下，這卻是讓遊客多看看澳洲、而不只是大城市的好方法。要加入豐收小徑計畫，遊客年齡必須介於 18 到 30 歲，並持有特別的打工度假簽證。下次去澳洲時，你可以試試這個計畫。',
    ],
    '102-p1': [
        '俗話說：「早睡早起，使人健康、富裕又聰明。」然而，碰到臨時要複習，或有派對要參加這類事情，我們有時都得熬夜。以下是一些實用建議，幫助你到了夜裡仍保持十分清醒。',
        '首先，務必在前一晚睡好。這樣才能為接下來的一天做好準備，並讓你維持更久的精神。對青少年來說，七到八小時的睡眠通常就夠了。另一個明智的做法是避免蛋糕或漢堡這類油膩食物。相反地，熬夜前以水果、蔬菜和穀類為主，這些食物能讓你有飽足感，又不會讓你想睡。',
        '含大量咖啡因的飲料，像咖啡和紅牛，會讓你的精力提升幾個小時。但咖啡因太多會讓你感到焦慮，還會頭痛。比較有效的飲料選擇是綠茶，咖啡因較少，卻能讓你撐得更久。',
        '更好的是，服用維生素 B 錠對免疫系統有益，也能幫助你保持專注。所以下次需要開夜車時，務必遵循這些實用秘訣！',
    ],
    '102-p2': [
        '你抓抓頭，一陣白色碎屑就落在眼前。是在下雪嗎？可惜不是。你只是有了頭皮屑。這時低頭一看肩膀，已經像一片覆著「雪」的田野，就知道問題有多嚴重。你趕緊拍掉那些死皮屑，心裡祈求沒有人注意到，因為儘管超過百分之五十的人都有這個困擾，頭皮屑還是會讓人難堪。',
        '頭皮屑的基本原因簡單，而且無法避免：你的皮膚不斷在更新。皮膚細胞變老後會被往外推，最後死亡並剝落。對大多數人來說，這些屑屑通常小到看不出來。然而對頭皮屑的人而言，皮膚細胞脫落得非常快，或是黏在一起形成大片碎屑。有好些因素會造成這種情況。吃某些甜食、經常處於極熱或極冷的環境、流汗，以及對髮品過敏，都被認為會引發頭皮屑。但這個狀況的主因，是長在頭皮上的一種真菌。對那些容易爆發屑屑問題的人來說，這種真菌長得很快；除了造成頭皮屑，還會讓皮膚又癢又紅。',
        '不過，幫助就在手邊，也就是特別的藥用抗屑洗髮精。這些洗髮精裡的化學成分有助於去除死皮細胞，並對付會形成屑屑的真菌。它們無法把頭皮屑完全治好，但應該能讓這種個人的「暴風雪」成為過去。',
    ],
    '103-p1': [
        '根據民調，有一件事比死亡更讓人害怕，那就是在眾人面前說話。每個人都得經歷克服這種恐懼的過程，我們稱之為「怯場」，政治人物、演員和歌手也不例外。克服怯場很像學一種新語言。它需要時間和練習，而你花在練習上的任何時間都是值得的，因為學會面對並克服恐懼，是一種會讓你受用的能力。',
        '比方說，如果你在公司工作，可能會被要求教新進同事怎麼做某件事，或是需要向來訪的顧客說明一項產品。工作之外，你可能在領獎之後被請來說幾句話，或是在朋友的婚禮上致詞。',
        '重點是，你永遠不知道什麼時候會被要求公開說話。所以，面對你的恐懼，隨時準備好清楚而有信心地說些什麼。',
    ],
    '103-p3': [
        '美國一所大學最近的研究顯示，笑能像運動一樣，幫助血管更有效率地運作。醫師並不建議人們停止運動，而是鼓勵每個人每天試著笑十五分鐘。不過，科學家仍不知道為什麼笑對健康這麼有益。是因為你笑的時候，大腦會釋出有益的化學物質嗎？還是因為笑鍛鍊了腹部肌肉和肺，並增加血液中的氧氣？',
        '笑的另一個好處，是能增強免疫系統，提高身體抵抗感冒和流感的能力，所以笑得比較勤的人比較不容易生病。笑也能降低血壓，並減少壓力荷爾蒙。笑會促使身體釋出天然的止痛物質，因此頭痛或其他疼痛的人，笑過之後會覺得舒服一些。',
        '另一項研究中，護理師在醫療處置之後對部分病人說笑話。聽了笑話的病人表示，疼痛比沒聽笑話的人少。如今大多數醫院都設有歡笑部門。針對生病的孩子，有些醫院有小丑醫生。他們不是真正的醫生，而是扮成小丑的演員，臉上塗白、鼻子鮮紅、服裝色彩鮮豔、鞋子很大。他們有好笑的名字，有時還唱歌或變魔術。孩子生病住院會害怕，因為離開了家和家人，而且常常不了解自己的病。小丑醫生幫助他們在接受治療時笑出來，感覺比較開心。成年病人也很喜歡他們！',
    ],
    '104-p1': [
        '「可以打折嗎？」答案很大程度上取決於你人在世界的哪個地方。你是在東南亞、中東、拉丁美洲，還是非洲？在這些地方以及其他幾個地方，價格往往不是說定就不能改的。事實上，顧客在同意價錢之前，通常會被期待先殺價。店員常常先開高價，因為他們打算再把價格降下來。',
        '相較之下，在北美洲、歐洲和澳洲，殺價很少見，而且常常不受歡迎。價籤上標示的價格不能更改。',
        '但大家的期待會因店而異，也因國家而異。大型商店和購物中心通常不允許殺價，即使在一般可以接受殺價的國家也是如此。另一方面，即使在西方國家，路邊攤和跳蚤市場通常允許殺價。如果拿不定主意，查一本旅遊指南，或者更好的是，問當地的朋友。',
    ],
    '104-p3': [
        '法國人給了世界熱氣球、縫紉機和比基尼，甚至把自由女神像送給了美國。',
        '然而，有一樣東西法國人不能居功，那就是薯條。儘管名字如此，薯條並不是法國的。薯條的起源被追溯到比利時；歷史學家說，十七世紀末那裡已經有人在炸馬鈴薯。據說，住在默茲河谷的貧窮村民常常把河裡抓到的小魚炸來吃。冬天河水結冰，無法捕魚，村民只好另找食物。他們轉向塊根作物馬鈴薯，用準備魚的方式切片油炸，最早的薯條就這樣誕生了。',
        '第一次世界大戰期間，美軍駐紮在比利時時接觸到這種美味的炸馬鈴薯。由於比利時軍隊的官方語言是法語，美國士兵就把這種好吃的食物暱稱為「法式薯條」（French fries）。這個名字就此留下來，幾十年後，美國人仍把功勞記在錯誤的國家頭上。',
        '不過英國人不是這樣。在英國，它們叫做 chips。薯條是世界上最受歡迎的配菜之一。說到沾醬，薯條常常被淋上番茄醬、美乃滋或醋，但全球共通的偏好似乎到此為止。在比利時，人們喜歡薯條配煮淡菜，或在上面放一顆煎蛋。英國以「炸魚薯條」聞名。在中東，薯條和雞肉一起包進皮塔餅；在法國，薯條則搭配烤牛排。',
    ],
    '105-p1': [
        '目前，Wi-Fi 是快速無線資料傳輸的標準。未來，我們很可能都會改用更快的東西——Li-Fi，意思是「光保真」。它是一種用可見光來傳輸資料的新型無線技術。',
        'Li-Fi 在 2011 年向公眾推出，速度比 Wi-Fi 快得多。資料以每秒 1 gigabyte 傳輸，是我們今天平均 Wi-Fi 速度的一百倍。',
        '和 Wi-Fi 的無線電波不同，光無法穿過牆壁。這表示正在傳輸的資料無法被其他人取得。不過，有些人把這一點看成限制，因為 Li-Fi 始終需要可見光才能運作。目前，Li-Fi 比較可能用在需要更高安全性的場所，例如飛機或醫院。大多數專家同意，這項技術還要很多年，才會在社會上廣泛使用。',
    ],
    '105-p2': [
        '對大多數青少年來說，電玩是一種有趣的現實逃避，但父母認為電玩充滿暴力，而且浪費時間。親子之間的拉扯已經持續多年。然而，電玩除了是一種獨特的娛樂，真的能讓你變聰明嗎？',
        '和大多數父母所想的相反，許多研究顯示情況可能確實如此。玩過電玩之後，研究人員看到認知功能有所提升。一項研究讓部分參與者在兩個月內、每天玩三十分鐘《超級瑪利歐 64》。之後，和對照組相比，這些參與者大腦中與記憶、策略規劃以及手部精細動作有關的區域，灰質增加了。灰質越多，功能越好！電玩對有精神方面疾患的孩子也可能有教育作用。一項研究中，電玩幫助有讀寫障礙的孩子讀得更有效率。另一項小型研究裡，玩一般電玩的讀寫障礙兒童，最後讀得更快，也更準確。',
        '即使電玩確實可能有益，過度遊玩對任何人都絕對有害。而且，如果玩遊戲是他或她唯一在做的事，從遊戲中新得到的技能也沒有地方發揮。所以，偶爾享受一下遊戲固然有好處，也要記得：真實人生比虛擬世界更加豐富，同樣需要好好打理。',
    ],
    '106-p1': [
        '孟加拉在 1974 年遭受嚴重饑荒時，穆罕默德．尤努斯是一位經濟學教授。數百萬挨餓的人湧進城市，需要食物。他決定做點事，幫助這些可憐的人。',
        '因此，在帶學生到鄉下觀察窮人生活的同時，他想出一個將改變數百萬人命運的主意。他把貸款提供給那些因極小債務、卻處於不公平條件而受苦的婦女。不久，她們開始有了積蓄，也能把錢還給他。這大大改善了她們的生活狀況。',
        '這個小小的成功讓尤努斯有了想法。他獲得一家主要政府銀行的支持，來資助他的計畫，並創立了格拉明銀行。從那時起，他一直致力於幫助窮人，而且會一輩子繼續為自己的理想工作。',
    ],
    '106-p2': [
        '一些科學家最近發現一種會消耗 PET 的新細菌。PET 是用在各式產品上的一種塑膠。這種細菌叫做 I. sakaiensis，研究人員聲稱它是已知第一種能把 PET 完全分解的物種。它的作用方式，是把 PET 變成另一種叫做 MHET 的物質，接著再把那種物質變成 PET 的基本成分，而這些成分可以再利用。',
        '這是重要的發現，因為每年都有大量塑膠被倒進掩埋場。不過，它有一個缺點。I. sakaiensis 要花很長的時間才能吃掉 PET。這表示這種細菌並不是解決世界塑膠污染的快速辦法，但它顯示這個問題是可以解決的。',
    ],
    '106-p3': [
        '日本政府支持一項做法，既減輕日本勞工的壓力，同時刺激消費。這項新措施叫做「Premium Friday」（高級星期五）。經濟產業省的發言人說，這項活動鼓勵員工在每個月最後一個星期五提早下班，去放鬆或購物。日本各地約有一百三十家公司報名參加，其中包括許多大型雇主。由於日本勞工出了名地像工作狂，懷疑者不敢確定這個方案會不會成功。內閣官房長官菅義偉告訴記者：「Premium Friday 要生根，還需要時間。」',
        'Premium Friday 的構想，部分是因為廣告公司電通一名員工自殺而促成；這名員工持續被要求過度加班。法院裁定這起自殺是「過勞死」，並強調必須處理在日本很常見的問題——過勞。',
        '日本首相安倍晉三以身作則。他在下午三點半提早離開辦公室，到東京一座寺廟打坐，藉此推廣這項活動。菅義偉先生說，政府和民間部門都必須營造一種氣氛，讓員工覺得提早離開是自在的。',
        '然而，許多勞工說，他們為了把工作做完，只好改到星期六上班。',
    ],
    '106-p5': [
        '徵求飼主：新訓練完成的導盲犬',
        '導盲犬說明：（1）一種經過專門訓練、用來幫助視覺障礙者的輔助犬。（2）拉布拉多，三歲，公犬，剛完成一年的訓練。（3）穩定、冷靜、忠誠、有禮貌。',
        '可能的導盲犬飼主：（1）視覺障礙者。（2）日常生活需要導盲犬協助的人。（3）有穩定收入、沒有心理問題的人。（4）願意照顧自己的聽導犬，並願意接受如何與牠相處之訓練的人。（5）自願選擇飼養導盲犬的人，而不是因為家人認為他們需要才養。',
        '申請程序：（1）可能的飼主應把申請表寄到台灣導盲犬協會。（2）協會會邀請可能的飼主面談，討論細節。（3）可能的飼主和導盲犬將一起接受至少約三個月的訓練。之後，訓練師會決定這隻狗和可能的飼主是否適合彼此。',
    ],
}


def flatten(text: str) -> str:
    return text.replace('\n\n', ' ').strip()


def split_passage(text: str, starts: list) -> list:
    flat = flatten(text)
    paras = []
    rest = flat
    for start in starts:
        idx = rest.find(start)
        if idx < 0:
            raise SystemExit(f'anchor not found: {start!r}')
        if idx == 0:
            raise SystemExit(f'anchor at start: {start!r}')
        if rest[idx - 1] != ' ':
            raise SystemExit(f'anchor not preceded by a space: {start!r} / {rest[idx-12:idx+12]!r}')
        paras.append(rest[:idx - 1])
        rest = rest[idx:]
    paras.append(rest)
    if ' '.join(paras) != flat:
        raise SystemExit('join does not restore the original passage')
    if not (2 <= len(paras) <= 4):
        raise SystemExit(f'expected 2–4 paragraphs, got {len(paras)}')
    return paras


def choice_text(q: dict) -> str:
    letter = q.get('answer') or ''
    for raw in q.get('choices') or []:
        m = re.match(r'^([A-D])[.\s、．]+(.*)$', str(raw).strip())
        if m and m.group(1) == letter:
            return m.group(2).strip()
    raise SystemExit(f'missing answer text for {q.get("id")}')


def fill_paragraphs(paragraphs: list, answers: list) -> list:
    """answers: [(qnum, text), ...] in question order. Only cloze passages have blanks."""
    out = []
    cursor = 0
    used = set()
    for para in paragraphs:
        if '______' in para:
            while '______' in para:
                if cursor >= len(answers):
                    raise SystemExit('more blanks than answers')
                para = para.replace('______', answers[cursor][1], 1)
                used.add(answers[cursor][0])
                cursor += 1
            out.append(para)
            continue
        for qnum, text in answers:
            para, n = re.subn(rf'\b{qnum}\b', text, para)
            if n:
                used.add(qnum)
        out.append(para)
    if any('______' in p for p in out):
        raise SystemExit('unfilled blank remains')
    missing = [q for q, _ in answers if q not in used]
    if missing:
        raise SystemExit(f'answers not placed: {missing}')
    return out


def main():
    data = json.loads(QUIZ.read_text(encoding='utf-8'))
    groups = {}
    for key, items in data.items():
        if not isinstance(items, list) or not key.startswith('exam'):
            continue
        for q in items:
            if q.get('section') not in ('cloze', 'reading') or not q.get('passage'):
                continue
            pid = q.get('passageId')
            if not pid:
                raise SystemExit(f'{q.get("id")} has a passage but no passageId')
            g = groups.setdefault(pid, {'year': q.get('year'), 'section': q.get('section'), 'passage': q['passage'], 'qs': []})
            if g['passage'] != q['passage']:
                raise SystemExit(f'passage text differs inside {pid}')
            g['qs'].append(q)

    unknown = set(groups) - set(STARTS)
    extra = set(STARTS) - set(groups)
    if unknown or extra:
        raise SystemExit(f'passage id mismatch unknown={sorted(unknown)} extra={sorted(extra)}')
    if set(ZH) != set(STARTS):
        raise SystemExit('translation keys do not match passages')

    passages = {}
    for pid, g in groups.items():
        paragraphs = split_passage(g['passage'], STARTS[pid])
        zh = ZH[pid]
        if len(zh) != len(paragraphs):
            raise SystemExit(f'{pid}: {len(paragraphs)} paragraphs but {len(zh)} translations')
        if any(not t.strip() for t in zh):
            raise SystemExit(f'{pid}: empty translation')
        record = {
            'year': g['year'],
            'section': g['section'],
            'paragraphs': paragraphs,
            'zh': zh,
        }
        if g['section'] == 'cloze':
            answers = [(q['qnum'], choice_text(q)) for q in sorted(g['qs'], key=lambda q: q['qnum'])]
            record['filled'] = fill_paragraphs(paragraphs, answers)
            if len(record['filled']) != len(zh):
                raise SystemExit(f'{pid}: filled paragraphs do not match translations')
        passages[pid] = record
        joined = '\n\n'.join(paragraphs)
        for q in g['qs']:
            q['passage'] = joined

    ordered = {}
    for key, value in data.items():
        if key == 'passages':
            continue
        ordered[key] = value
        if key == 'meta':
            gloss = value.get('gloss') or ''
            note = '閱讀與克漏字的共用文章已分段，並附全文中譯。'
            if note not in gloss:
                value['gloss'] = (gloss + ' ' + note).strip()
            ordered['passages'] = passages
    if 'passages' not in ordered:
        ordered['passages'] = passages

    QUIZ.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    QUIZ_JS.write_text(
        'window.__EN_QUIZ__ = ' + json.dumps(ordered, ensure_ascii=False) + ';\n',
        encoding='utf-8',
    )
    print(f'passages {len(passages)}')
    for pid, rec in passages.items():
        print(f"  {pid} {rec['section']} paras={len(rec['paragraphs'])} zh={len(rec['zh'])} filled={len(rec.get('filled') or [])}")


if __name__ == '__main__':
    main()
