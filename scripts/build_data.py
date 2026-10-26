#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build offline learning data for 中油學習卡."""
import json, re, os, hashlib
from pathlib import Path

ROOT = Path('/workspace/mistake-notebook')
BANK_SRC = Path('/workspace/exam-bank')
OUT_EXAM = ROOT / 'data/exam'
OUT_ZH = ROOT / 'data/zh'
OUT_EN = ROOT / 'data/en'
OUT_MATH = ROOT / 'data/math'

EM_KW = re.compile(
    r'變壓器|感應機|感應電動機|同步機|同步電動機|直流機|直流電動機|發電機|電動機|馬達|'
    r'電樞|磁場繞組|轉子|定子|滑差|轉差|勵磁|整流子|換向|極數|磁極|'
    r'繞組|短路比|同步阻抗|空載|滿載|效率.*電動|感應電動|同步電動|'
    r'變壓比|匝數比|鐵損|銅損|磁滯|渦流|激磁|無載|分激|複激|串激|'
    r'三相感應|同步轉速|轉矩|扭力|轉速|極距|節距|電刷|集電環'
)
EE_KW = re.compile(
    r'電阻|電容|電感|克希荷夫|克希霍夫|歐姆|功率因數|諧振|三相|星形|角形|'
    r'電抗|阻抗|導納|電導|電納|庫侖|電量|電場|磁場|磁通|法拉第|'
    r'戴維寧|諾頓|疊加|節點|迴路|並聯|串聯|分壓|分流|最大功率|'
    r'正弦波|有效值|平均值|峰値|峰值|相量|相位|頻率|角頻率|'
    r'RLC|RC電路|RL電路|LC電路|濾波器|整流|二極體|電晶體|'
    r'單位.*公尺|奈米|仟瓦|度電|電費|電壓源|電流源|開路|短路'
)

def classify(stem: str) -> str:
    s = stem or ''
    em = len(EM_KW.findall(s))
    ee = len(EE_KW.findall(s))
    if em > ee: return 'em'
    if ee > em: return 'ee'
    # tie / neither: prefer ee for circuit basics, em if motor/transformer words weak
    if EM_KW.search(s): return 'em'
    return 'ee'

def is_concept(q) -> bool:
    stem = q.get('stem') or ''
    # heavy calc / figure calc → not concept
    if q.get('hasFigure'):
        # figure questions often calc; still allow pure identification
        if re.search(r'求|計算|等於多少|為多少|是多少|幾[安伏歐瓦]|Ω|V\s*=|I\s*=', stem):
            return False
    if re.search(r'計算|求下列|等於多少|為多少|是多少|應繳|電費多少|電流比|電壓比|總電感|總電阻|總電容', stem):
        # allow pure definition-style
        if re.search(r'下列何者|哪一個|什麼定律|何謂|定義|單位|現象|特性|屬於|不屬於|不是', stem):
            return True
        return False
    if re.search(r'下列|何者|哪[一個]|定律|現象|特性|單位|定義|原理|屬於|不是|何種', stem):
        return True
    return False

def load_bank():
    allq = []
    for y in ['104','105','106','108','109','110','111','113']:
        path = BANK_SRC / y / 'questions.json'
        qs = json.loads(path.read_text(encoding='utf-8'))
        for q in qs:
            stem = (q.get('stem') or '').strip()
            track = classify(stem)
            concept = is_concept(q)
            fig = q.get('figurePath') or ''
            # normalize figure path to app-relative
            if fig:
                # figures/113/q15.png → data/exam/figures/113/q15.png
                fig = 'data/exam/' + fig if not fig.startswith('data/') else fig
                if fig.startswith('data/exam/figures/') is False and 'figures/' in fig:
                    # already figures/YEAR/...
                    fig = 'data/exam/' + fig.replace('data/exam/', '')
            item = {
                'id': f"cpc-{q.get('year')}-{q.get('qnum')}",
                'year': int(q.get('year') or y),
                'qnum': q.get('qnum'),
                'track': track,  # ee | em
                'source': 'cpc',
                'kind': 'concept' if concept else 'drill',
                'stem': stem,
                'choices': q.get('choices') or [],
                'answer': (q.get('answer') or '').strip().upper()[:1],
                'hasFigure': bool(q.get('hasFigure')),
                'figurePath': fig if q.get('hasFigure') else '',
                'explain': '',
                'extension': False,
                'answerConfidence': 'high' if q.get('answer') else 'none',
                'notes': q.get('notes') or ''
            }
            if not item['answer']:
                item['answerConfidence'] = 'none'
            allq.append(item)
    return allq

# --- curated concept deck (high-school / 統測 level) ---
CONCEPTS = [
  {"id":"ext-ohm","track":"ee","topic":"歐姆定律","stem":"歐姆定律的基本關係式為何？","choices":["A. V = I × R","B. V = I / R","C. P = I × R","D. R = I × V"],"answer":"A","explain":"電壓＝電流×電阻。功率 P＝V×I＝I²R＝V²/R。","extension":True},
  {"id":"ext-series-r","track":"ee","topic":"串聯電阻","stem":"兩個電阻 R1、R2 串聯，等效電阻為？","choices":["A. R1＋R2","B. R1×R2/(R1＋R2)","C. (R1＋R2)/2","D. |R1－R2|"],"answer":"A","explain":"串聯電流相同，電阻相加。","extension":True},
  {"id":"ext-parallel-r","track":"ee","topic":"並聯電阻","stem":"兩個電阻並聯，等效電阻公式為？","choices":["A. R1＋R2","B. R1×R2/(R1＋R2)","C. R1－R2","D. 2(R1＋R2)"],"answer":"B","explain":"並聯電壓相同；兩電阻並聯用乘積除以和。","extension":True},
  {"id":"ext-power","track":"ee","topic":"電功率","stem":"直流電路功率的正確表示為何？","choices":["A. P＝V×I","B. P＝V／I","C. P＝V＋I","D. P＝V－I"],"answer":"A","explain":"功率等於電壓乘電流；單位瓦特 W。","extension":True},
  {"id":"ext-energy","track":"ee","topic":"電能","stem":"電能（度電）常用公式為？","choices":["A. 電能＝功率×時間","B. 電能＝功率／時間","C. 電能＝電壓×電阻","D. 電能＝電流×電阻"],"answer":"A","explain":"1 度＝1 kWh＝功率(kW)×時間(h)。","extension":True},
  {"id":"ext-cap-series","track":"ee","topic":"電容串聯","stem":"兩個電容串聯，等效電容會？","choices":["A. 比任一電容都小","B. 等於兩電容相加","C. 等於較大者","D. 不變"],"answer":"A","explain":"串聯電容：1/C＝1/C1＋1/C2，等效比最小的還小。","extension":True},
  {"id":"ext-cap-parallel","track":"ee","topic":"電容並聯","stem":"兩個電容並聯，等效電容為？","choices":["A. C1＋C2","B. C1×C2/(C1＋C2)","C. |C1－C2|","D. C1／C2"],"answer":"A","explain":"並聯電容像並聯「儲電能力」，直接相加。","extension":True},
  {"id":"ext-ind-series","track":"ee","topic":"電感串聯","stem":"不計互感時，兩電感串聯等效為？","choices":["A. L1＋L2","B. L1×L2/(L1＋L2)","C. L1－L2","D. √(L1L2)"],"answer":"A","explain":"串聯電感相加（無互感）。","extension":True},
  {"id":"ext-xl","track":"ee","topic":"感抗","stem":"感抗 XL 與頻率的關係？","choices":["A. XL＝2πfL，頻率愈高感抗愈大","B. XL＝1/(2πfL)","C. 與頻率無關","D. 頻率愈高感抗愈小"],"answer":"A","explain":"電感對高頻較「擋」交流。","extension":True},
  {"id":"ext-xc","track":"ee","topic":"容抗","stem":"容抗 XC 與頻率的關係？","choices":["A. XC＝1/(2πfC)，頻率愈高容抗愈小","B. XC＝2πfC","C. 與頻率無關","D. 頻率愈高容抗愈大"],"answer":"A","explain":"電容對高頻較「容易通過」。","extension":True},
  {"id":"ext-resonance","track":"ee","topic":"諧振","stem":"串聯 RLC 諧振時，阻抗最小且呈？","choices":["A. 純電阻性","B. 純電感性","C. 純電容性","D. 開路"],"answer":"A","explain":"XL＝XC 時電抗抵消，只剩 R。","extension":True},
  {"id":"ext-kirchhoff-i","track":"ee","topic":"克希荷夫電流定律","stem":"KCL（克希荷夫電流定律）說明？","choices":["A. 流入節點電流代數和為零","B. 迴路電壓和為零","C. 功率守恆","D. 電阻越大電流越大"],"answer":"A","explain":"電荷守恆→節點電流進出平衡。","extension":True},
  {"id":"ext-kirchhoff-v","track":"ee","topic":"克希荷夫電壓定律","stem":"KVL 說明？","choices":["A. 閉合迴路電壓升降代數和為零","B. 節點電流和為零","C. 電阻串聯分壓與電阻成反比","D. 並聯電流相等"],"answer":"A","explain":"沿迴路走一圈，電位差總和為 0。","extension":True},
  {"id":"ext-rms","track":"ee","topic":"有效值","stem":"正弦波電壓有效值 Vrms 與峰值 Vm 關係？","choices":["A. Vrms＝Vm/√2","B. Vrms＝Vm×√2","C. Vrms＝Vm/2","D. Vrms＝Vm×π"],"answer":"A","explain":"市電 110V 指的是有效值。","extension":True},
  {"id":"ext-pf","track":"ee","topic":"功率因數","stem":"功率因數 cosθ 的定義？","choices":["A. 實功／視在功率","B. 虛功／實功","C. 電壓／電流","D. 電阻／電抗"],"answer":"A","explain":"cosθ＝P/S；愈接近 1 愈省無功。","extension":True},
  {"id":"ext-three-wye","track":"ee","topic":"三相星形","stem":"平衡星形接線，線電壓與相電壓關係？","choices":["A. 線電壓＝√3 × 相電壓","B. 線電壓＝相電壓","C. 線電壓＝相電壓/√3","D. 線電壓＝3 × 相電壓"],"answer":"A","explain":"星形：VL＝√3 Vph，IL＝Iph。","extension":True},
  {"id":"ext-three-delta","track":"ee","topic":"三相角形","stem":"平衡角形（Δ）接線，線電流與相電流關係？","choices":["A. 線電流＝√3 × 相電流","B. 線電流＝相電流","C. 線電流＝相電流/√3","D. 線電流＝3 × 相電流"],"answer":"A","explain":"角形：VL＝Vph，IL＝√3 Iph。","extension":True},
  {"id":"ext-faraday","track":"ee","topic":" Faraday","stem":" Faraday 電磁感應定律大意？","choices":["A. 磁通變化會產生應電勢","B. 電流產生電場","C. 電阻與溫度無關","D. 電荷守恆於節點"],"answer":"A","explain":"e＝－N dφ/dt（楞次定律決定方向）。","extension":True},
  {"id":"ext-lenz","track":"ee","topic":"楞次定律","stem":"楞次定律指出應電勢方向會？","choices":["A. 反抗引起它的磁通變化","B. 加強原磁通變化","C. 與電流無關","D. 永遠與電壓同向"],"answer":"A","explain":"能量守恆：感應要「對抗」變化。","extension":True},
  {"id":"ext-cap-dc","track":"ee","topic":"電容直流","stem":"理想電容在直流穩態時相當於？","choices":["A. 開路","B. 短路","C. 純電阻","D. 純電感"],"answer":"A","explain":"穩態直流無電流通過電容（開路）。","extension":True},
  {"id":"ext-ind-dc","track":"ee","topic":"電感直流","stem":"理想電感在直流穩態時相當於？","choices":["A. 短路","B. 開路","C. 大電阻","D. 電容"],"answer":"A","explain":"穩態直流電感兩端電壓為 0（短路）。","extension":True},
  {"id":"ext-xfmr-ratio","track":"em","topic":"變壓器匝比","stem":"理想變壓器 Vp/Vs ≈ Np/Ns，若 Ns＞Np 則為？","choices":["A. 升壓變壓器","B. 降壓變壓器","C. 隔離但不變壓","D. 整流器"],"answer":"A","explain":"二次匝數多→二次電壓高。","extension":True},
  {"id":"ext-xfmr-ideal","track":"em","topic":"理想變壓器","stem":"理想變壓器假設不計？","choices":["A. 銅損、鐵損與漏磁","B. 匝數比","C. 電壓比","D. 頻率"],"answer":"A","explain":"理想化：無損、無漏磁，便於算匝比。","extension":True},
  {"id":"ext-slip","track":"em","topic":"轉差","stem":"感應電動機轉差率 s＝？","choices":["A. (Ns－Nr)/Ns","B. Nr/Ns","C. Ns/Nr","D. (Nr－Ns)/Nr"],"answer":"A","explain":"Ns 同步轉速、Nr 轉子轉速；滿載 s 通常很小。","extension":True},
  {"id":"ext-sync-speed","track":"em","topic":"同步轉速","stem":"同步轉速 Ns（rpm）公式？","choices":["A. Ns＝120f／P","B. Ns＝60f／P","C. Ns＝f×P","D. Ns＝120P／f"],"answer":"A","explain":"f 頻率、P 極數。","extension":True},
  {"id":"ext-induction","track":"em","topic":"感應電動機","stem":"三相感應電動機轉子電流由什麼產生？","choices":["A. 感應（電磁）","B. 電刷直接饋電","C. 電池","D. 永磁"],"answer":"A","explain":"定子旋轉磁場在轉子感應出電流。","extension":True},
  {"id":"ext-sync-motor","track":"em","topic":"同步電動機","stem":"同步電動機穩態轉速？","choices":["A. 等於同步轉速","B. 必小於同步轉速","C. 必大於同步轉速","D. 與負載無關且為零"],"answer":"A","explain":"轉子與旋轉磁場同步旋轉。","extension":True},
  {"id":"ext-dc-series","track":"em","topic":"串激直流","stem":"串激直流電動機起動轉矩通常？","choices":["A. 很大，適合起重／牽引","B. 很小","C. 為零","D. 與負載無關固定"],"answer":"A","explain":"電樞與磁場串聯，起動電流大→轉矩大。","extension":True},
  {"id":"ext-dc-shunt","track":"em","topic":"分激直流","stem":"分激直流電動機轉速特性較？","choices":["A. 接近恆速","B. 隨負載大幅上升","C. 無法空載","D. 只能間歇運轉"],"answer":"A","explain":"磁場幾乎恆定，轉速變化較小。","extension":True},
  {"id":"ext-generator","track":"em","topic":"發電機","stem":"發電機把什麼能量轉成電能？","choices":["A. 機械能","B. 化學能為主","C. 熱能直接","D. 光能"],"answer":"A","explain":"原動機帶動電樞／磁場相對運動而生電。","extension":True},
  {"id":"ext-transformer-loss","track":"em","topic":"變壓器損","stem":"變壓器鐵損主要與什麼有關？","choices":["A. 電壓／頻率（磁滯、渦流）","B. 負載電流平方","C. 僅與銅線長度","D. 環境濕度"],"answer":"A","explain":"鐵損≈與 V、f 有關；銅損≈I²R。","extension":True},
  {"id":"ext-efficiency","track":"em","topic":"效率","stem":"電機效率 η 一般定義？","choices":["A. 輸出／輸入","B. 輸入／輸出","C. 損耗／輸出","D. 電壓／電流"],"answer":"A","explain":"η＝Pout/Pin；損耗＝輸入－輸出。","extension":True},
  {"id":"ext-pole","track":"em","topic":"電工角","stem":"機械角 θm 與電工角 θe 關係（P 極）？","choices":["A. θe＝(P/2)×θm","B. θe＝θm","C. θe＝P×θm","D. θe＝θm/P"],"answer":"A","explain":"一對極對應 360° 電工角。","extension":True},
  {"id":"ext-unit-k","track":"ee","topic":"單位換算","stem":"4.7 kΩ 等於多少 Ω？","choices":["A. 4700 Ω","B. 4.7 Ω","C. 0.0047 Ω","D. 470 Ω"],"answer":"A","explain":"k＝10³。電學常用 k、m、μ。","extension":True},
  {"id":"ext-unit-m","track":"ee","topic":"單位換算","stem":"100 mA 等於多少 A？","choices":["A. 0.1 A","B. 100 A","C. 0.01 A","D. 10 A"],"answer":"A","explain":"m＝10⁻³。","extension":True},
  {"id":"ext-unit-u","track":"ee","topic":"單位換算","stem":"47 μF 等於多少 F？","choices":["A. 47×10⁻⁶ F","B. 47×10⁻³ F","C. 47×10⁶ F","D. 47 F"],"answer":"A","explain":"μ＝10⁻⁶。","extension":True},
  {"id":"ext-divider","track":"ee","topic":"分壓","stem":"串聯分壓：電阻越大，分到的電壓？","choices":["A. 越大","B. 越小","C. 一樣","D. 為零"],"answer":"A","explain":"VR＝V×R/Rtotal。","extension":True},
  {"id":"ext-shunt-i","track":"ee","topic":"分流","stem":"並聯分流：電阻越小，分到的電流？","choices":["A. 越大","B. 越小","C. 一樣","D. 為零"],"answer":"A","explain":"電流往阻抗小的路徑走。","extension":True},
  {"id":"ext-max-power","track":"ee","topic":"最大功率","stem":"最大功率轉移條件（直流）？","choices":["A. 負載電阻＝電源內阻","B. 負載＝0","C. 負載＝∞","D. 負載＝2×內阻"],"answer":"A","explain":"RL＝Rs 時負載得最大功率。","extension":True},
  {"id":"ext-diode","track":"ee","topic":"二極體","stem":"理想矽二極體順向導通時近似？","choices":["A. 短路（或約 0.7V 壓降）","B. 開路","C. 大電感","D. 電池反向"],"answer":"A","explain":"逆向近似開路；整流常用。","extension":True},
]

def build_concepts(bank):
    # seed concepts from bank (no answer missing preferred)
    seeded = []
    for q in bank:
        if q['kind'] != 'concept': continue
        if q['answerConfidence'] == 'none': continue
        seeded.append({
            'id': 'c-' + q['id'],
            'track': q['track'],
            'topic': '歷屆觀念',
            'stem': q['stem'],
            'choices': q['choices'],
            'answer': q['answer'],
            'explain': q.get('explain') or '選完可對照詳解；觀念題重在理解選項差異。',
            'extension': False,
            'year': q['year'],
            'qnum': q['qnum'],
            'hasFigure': q['hasFigure'],
            'figurePath': q['figurePath'],
            'source': 'cpc'
        })
    # limit seed to keep UI light but useful — keep all with answers that are concept
    curated = []
    for c in CONCEPTS:
        curated.append({
            'id': c['id'],
            'track': c['track'],
            'topic': c['topic'],
            'stem': c['stem'],
            'choices': c['choices'],
            'answer': c['answer'],
            'explain': c['explain'],
            'extension': True,
            'year': None,
            'qnum': None,
            'hasFigure': False,
            'figurePath': '',
            'source': 'extension'
        })
    return {'curated': curated, 'fromBank': seeded, 'totals': {'curated': len(curated), 'fromBank': len(seeded)}}

# --- 114 parse ---
GLYPH_ANS = {'\uf2b7':'A','\uf2b8':'B','\uf2b9':'C','\uf2ba':'D',
             '':'A','':'B','':'C','':'D'}
# circled nums often private use — map common ones from pdftotext output
# We'll parse by pattern: ANSWER_GLYPH + optional space + QNUM_GLYPH + stem

def parse_114():
    text = Path('/tmp/114_ge.txt').read_text(encoding='utf-8')
    # Normalize known PUA
    for k,v in list(GLYPH_ANS.items()):
        text = text.replace(k, f'[{v}]')
    # Question number markers from file: =1 ... use sequential after splitting 國文/英文
    # Simpler: hand-structured from known text since we have clean layout

    zh_mc = [
      ("下列詞語，何者有錯別字？", ["實踐諾言","水花四濺","賤別好友","寄送信箋"], "C", "「賤別」應為「餞別」。"),
      ("「瑕不掩□、□時不候、覬□財產」上述三個語詞，□內依序應填入：", ["瑜∕逾∕覦","逾∕覦∕瑜","俞∕渝∕揄","渝∕揄∕俞"], "A", "瑕不掩瑜、時不我待（逾時不候）、覬覦。"),
      ("《論語》：「知之者不如好之者，好之者不如□之者。」□內應填入：", ["惡","善","樂","哀"], "C", "原文好之者／樂之者（考卷作好知者為通假排版）。樂之者最上一層。"),
      ("下列有關題辭的運用，書寫正確的選項是：", ["祝賀結婚：妙筆生花","祝賀生子：弄璋誌喜","祝賀當選：美輪美奐","祝賀畢業：天作之合"], "B", "弄璋誌喜用於生子；天作之合用於結婚。"),
      ("下列哪一個文句是勸人要盡其所能幫助別人？", ["謂學不暇給者，雖暇亦不能學","衣帶漸寬終不悔，為伊消得人憔悴","少年亦老學難成，一寸光陰不可輕","既以為人，己愈有；既以與人，己愈多"], "D", "出自《老子》，付出愈多自己愈充足。"),
      ("朋友餐廳即將開幕，如要致贈花籃表達心意，適合的題辭是：", ["杏林春暖","名山事業","百工居肆","近悅遠來"], "D", "近悅遠來賀開店／生意興隆。杏林春暖賀醫。"),
      ("〈鴻門宴〉中：「項莊舞劍，意在沛公。」請問「沛公」指何人？", ["劉備","劉邦","項羽","張良"], "B", "沛公即劉邦。"),
      ("下列哪個選項的章回目次是屬於《三國演義》一書的？", ["用奇謀孔明借箭，獻密計黃蓋受刑","景陽岡武松打虎，潘金蓮嫌夫賣風月","歷山山下古帝遺蹤，明湖湖邊美人絕調","唐三藏路阻火焰山，孫行者一調芭蕉扇"], "A", "孔明借箭、黃蓋為三國；B 水滸、D 西遊。"),
      ("〈赤壁賦〉中下列哪一組文句是形容音樂的感染力和內心的抑鬱悲哀？", ["白露橫江，水光接天","月明星稀，烏鵲南飛","舞幽壑之潛蛟，泣孤舟之嫠婦","寄蜉蝣於天地，渺滄海之一粟"], "C", "寫簫聲感動潛蛟、嫠婦。"),
      ("以下《論語》句子的解釋，何者正確？", [
          "巧言令色，鮮矣仁：花言巧語裝出討人喜歡的神色的人，是最具有仁心者",
          "君子固窮，小人窮斯濫矣：君子本來就會很窮，小人因作惡多端會更窮困",
          "不患人之不己知，患不知人也：不怕別人不知道自己，怕自己比不上別人",
          "夫仁者，己欲立而立人，己欲達而達人：行仁之人，自己能自立也要幫助別人自立，自己能發達也要幫助別人發達"
      ], "D", "D 正確。A 鮮矣仁＝很少有仁；B 固窮＝窮困仍守正；C 患不知人＝怕不了解別人。"),
      ("「亙古不變」的「亙」，讀音應為下列何者？", ["ㄍㄣˋ","ㄍㄥˋ","ㄏㄥˊ","ㄏㄨㄢˊ"], "A", "亙音ㄍㄣˋ。"),
      ("形容一個人「面有慍色」是什麼樣的情緒？", ["悲傷","喜悅","擔憂","生氣"], "D", "慍＝怒、生氣。"),
      ("下列「」中的成語，何者使用正確？", [
          "開會時大家各說各話，最後仍「莫衷一是」，決定擇期再議",
          "他期待旅遊行程，興奮到「如坐針氈」，完全睡不著",
          "這次的報名人數太多，讓工作人員「寥寥可數」到忙不過來",
          "為了今天的發表會，他盛裝出席，打扮得「美輪美奐」"
      ], "A", "莫衷一是＝意見分歧無定論。如坐針氈＝不安；寥寥可數＝很少；美輪美奐多形容建築。"),
      ("形容「踰越自己的職分」的成語叫做「越□代庖」，其中□應填入的字是：", ["祖","俎","阻","詛"], "B", "越俎代庖。"),
      ("「梨園子弟」是指什麼人？", ["知識分子","富貴人家","戲曲演員","正人君子"], "C", "梨園指戲班。"),
      ("形容做壞事做得多了，必定會自己招致滅亡，叫做「多行不義必自□」，其中□應填入的字是：", ["滅","亡","弊","斃"], "D", "多行不義必自斃。"),
      ("「羔羊有跪乳之恩，慈烏有反哺之義。」是說明何種美德？", ["感恩","守信","孝順","謙虛"], "C", "跪乳、反哺喻孝。"),
      ("曹操〈短歌行〉：「何以解憂？唯有杜康。」其中「杜康」指的是：", ["歌","友","茶","酒"], "D", "杜康代稱酒。"),
      ("子曰：「揖讓而升，下而飲，其爭也君子。」是描述哪項活動？", ["飲酒","射箭","彈琴","駕車"], "B", "射禮。"),
      ("中國古代以「天干地支」計數，其中「地支」總共幾個字？", ["十二","十","六十","廿四"], "A", "子丑寅卯…共十二；天干十。"),
    ]

    en_vocab = [
      ("I wrote a letter to Mary last week, but she hasn’t ______ to it yet.", ["communicated","responded","disappointed","related"], "B", "respond to a letter＝回信。"),
      ("I am ______ of model cars and have collected a lot of them.", ["fond","embarrassing","cultural","valuable"], "A", "be fond of＝喜歡。"),
      ("The gallery owner praised the young artist for having a ______ vision, unlike anything seen before.", ["common","regular","general","special"], "D", "special／獨特眼光。"),
      ("The young waiter was so ______ that he accidentally broke three dishes during the dinner rush.", ["greasy","mighty","clumsy","sticky"], "C", "clumsy＝笨手笨腳。"),
      ("Many local groups are working hard to ______ the traditional languages before they completely disappear.", ["preserve","scatter","motivate","volunteer"], "A", "preserve＝保存。"),
      ("The recent global financial crisis has led to severe ______, making everything more expensive.", ["solution","inflation","condition","objection"], "B", "inflation＝通膨。"),
      ("Every individual should try to ______ to the efforts of environmental protection.", ["displeases","alternates","invades","contribute"], "D", "contribute to＝貢獻。"),
    ]
    en_grammar = [
      ("______ too many sugary drinks may harm your health.", ["Drink","Drank","Drinking","Is drinking"], "C", "動名詞當主詞。"),
      ("The student performed ______ on the test because she had not studied enough.", ["cheaply","hardly","shortly","badly"], "D", "badly＝表現差。"),
      ("With better public transportation, people in the city drive ______ cars than before.", ["lower","fewer","more","less"], "B", "cars 可數→fewer。"),
      ("I do not know ______ will become of the new policy.", ["what","who","where","why"], "A", "what will become of…。"),
      ("You should book your tickets ______ to ensure you get the best seats.", ["in advance","in address","in amount","in account"], "A", "in advance＝事先。"),
      ("Mary studies English ______ a daily basis to improve her language skills.", ["in","at","on","for"], "C", "on a daily basis。"),
      ("The lost boy did not know ______ so he burst into tears.", ["he was where","he where was","where was he","where he was"], "D", "名詞子句用直述語序。"),
    ]
    en_dialogue = [
      ("A: I'd like to have one hot coffee, please.\nB: Sure, ______？\nA: Black coffee, no sugar.",
       ["What size would you like","What about cold coffee","Do you want to come back later","How do you like your coffee"], "D", "問咖啡怎麼喝（糖／奶）。"),
      ("A: The movie was putting me to sleep.\nB: ______ It was the best movie I've ever seen!",
       ["You're telling me!","You've got a deal!","You must be joking!","You can say that again!"], "C", "對方覺得好看，應表難以置信。"),
      ("A: Let's go see the new exhibit downtown.\nB: ______\nA: Why not？\nB: I have to finish my school project.",
       ["I'd love to, but I can't.","I went there last week.","Sure, when are we going？","Great! I like exhibits very much."], "A", "婉拒後才解釋 Why not。"),
      ("A: Stella's ballet performance was terrific.\nB: ______？\nA: Since she was seven.",
       ["How old do people start learning ballet","How long has she been learning ballet","How often did she practice ballet","How much will you pay for a ballet show"], "B", "回答 Since…→問多久。"),
      ("A: The line is too long! Let's cut in so we can enter the theater on time.\nB: ______\nA: Okay, we'll join the end of the line.",
       ["Which theater do you prefer","Which movie are we going to see","How could you suggest that","How much are the tickets"], "C", "責備插隊提議。"),
      ("A: The speech you gave yesterday was marvelous. I was so impressed.\nB: Thank you. ______ Actually, I put a lot of effort into it.",
       ["I can’t believe it.","I appreciate that.","I knew you could do that.","I love your speech."], "B", "感謝稱讚。"),
    ]

    def pack(rows, subject, section, start=1):
        out=[]
        for i,(stem, choices, ans, exp) in enumerate(rows):
            out.append({
                'id': f'114-{subject}-{section}-{start+i}',
                'year': 114,
                'qnum': start+i,
                'subject': subject,
                'section': section,
                'stem': stem,
                'choices': [f"{chr(65+j)}. {c}" for j,c in enumerate(choices)],
                'answer': ans,
                'explain': exp,
                'answerConfidence': 'high',
                'source': 'cpc-114'
            })
        return out

    zh = pack(zh_mc, 'zh', 'mc', 1)
    en = pack(en_vocab, 'en', 'vocab', 21) + pack(en_grammar, 'en', 'grammar', 28) + pack(en_dialogue, 'en', 'dialogue', 35)

    # recall cards from vocab + a few grammar blanks
    recall = []
    for q in en:
        if q['section'] != 'vocab': continue
        # make blank card from stem
        recall.append({
            'id': 'recall-' + q['id'],
            'promptZh': '回想適當的英文字／片語，再翻開核對。',
            'sentence': q['stem'],
            'answerWord': re.sub(r'^[A-D]\.\s*','', [c for c in q['choices'] if c.startswith(q['answer'])][0]),
            'choices': q['choices'],
            'answer': q['answer'],
            'explain': q['explain'],
            'source': q['id']
        })

    return zh, en, recall

def gen_zh_from_knowledge():
    kb_path = ROOT / 'data/chinese/knowledge.json'
    kb = json.loads(kb_path.read_text(encoding='utf-8'))
    quizzes = []
    # 字音：pick correct reading
    for cat in kb.get('categories') or []:
        if cat.get('id') != 'chars': continue
        for sec in cat.get('sections') or []:
            cols = sec.get('columns') or []
            # find word / reading columns
            wi = next((i for i,c in enumerate(cols) if re.search(r'字|詞|正確寫法|成語', c)), 0)
            ri = next((i for i,c in enumerate(cols) if re.search(r'讀音|正確讀音', c)), None)
            if ri is None: continue
            rows = [r for r in (sec.get('rows') or []) if (r.get('cells') or r)]
            readings = []
            items = []
            for r in rows:
                cells = r.get('cells') or r
                w = (cells[wi] if wi < len(cells) else '') or ''
                rd = (cells[ri] if ri < len(cells) else '') or ''
                if w and rd and rd != '—':
                    items.append((w, rd))
                    readings.append(rd)
            # unique distractors
            readings = list(dict.fromkeys(readings))
            for w, rd in items[:80]:
                distractors = [x for x in readings if x != rd][:8]
                if len(distractors) < 3: continue
                # pick 3 distractors stably
                h = int(hashlib.md5(w.encode()).hexdigest(), 16)
                picks = []
                for k in range(len(distractors)):
                    picks.append(distractors[(h+k) % len(distractors)])
                picks = list(dict.fromkeys(picks))[:3]
                opts = picks + [rd]
                # shuffle stable
                opts = sorted(opts, key=lambda x: hashlib.md5((w+x).encode()).hexdigest())
                ans = chr(65 + opts.index(rd))
                quizzes.append({
                    'id': f'kb-phon-{hashlib.md5(w.encode()).hexdigest()[:8]}',
                    'kind': 'phonetic',
                    'label': '由常識表出題・字音',
                    'stem': f'「{w}」的正確讀音是？',
                    'choices': [f'{chr(65+i)}. {o}' for i,o in enumerate(opts)],
                    'answer': ans,
                    'explain': f'「{w}」讀作 {rd}。來源：常識總表／字音字形。',
                    'source': 'knowledge',
                    'answerConfidence': 'high'
                })
    # 成語／題辭 matching from classic or culture if present
    for cat in kb.get('categories') or []:
        for sec in cat.get('sections') or []:
            name = sec.get('name') or ''
            cols = sec.get('columns') or []
            if not re.search(r'題辭|成語|應用', name+ ''.join(cols)): continue
            if len(cols) < 2: continue
            rows = sec.get('rows') or []
            pairs = []
            for r in rows:
                cells = r.get('cells') or r
                if len(cells) < 2: continue
                a, b = cells[0], cells[1]
                if a and b and a != '—' and b != '—':
                    pairs.append((a, b))
            meanings = list(dict.fromkeys([p[1] for p in pairs]))
            for a,b in pairs[:40]:
                distractors = [x for x in meanings if x != b]
                if len(distractors) < 3: continue
                h = int(hashlib.md5(a.encode()).hexdigest(), 16)
                picks = list(dict.fromkeys([distractors[(h+k)%len(distractors)] for k in range(6)]))[:3]
                opts = picks + [b]
                opts = sorted(opts, key=lambda x: hashlib.md5((a+x).encode()).hexdigest())
                ans = chr(65 + opts.index(b))
                quizzes.append({
                    'id': f'kb-match-{hashlib.md5((a+b).encode()).hexdigest()[:8]}',
                    'kind': 'match',
                    'label': '由常識表出題・配對',
                    'stem': f'「{a}」最適合的說明／用法是？',
                    'choices': [f'{chr(65+i)}. {o}' for i,o in enumerate(opts)],
                    'answer': ans,
                    'explain': f'「{a}」→ {b}。來源：常識總表。',
                    'source': 'knowledge',
                    'answerConfidence': 'high'
                })
    return quizzes


# MATH lessons live in data/math/lessons.json (structured worked examples).
# Rebuild lessons-data.js from that file in main().

def write_js(path: Path, var_name: str, obj):
    path.write_text(f'window.{var_name} = {json.dumps(obj, ensure_ascii=False)};\n', encoding='utf-8')

def main():
    bank = load_bank()
    concepts = build_concepts(bank)
    zh114, en114, recall = parse_114()
    zh_auto = gen_zh_from_knowledge()

    OUT_EXAM.mkdir(parents=True, exist_ok=True)
    meta = {
        'years': sorted(set(q['year'] for q in bank)),
        'total': len(bank),
        'withAnswer': sum(1 for q in bank if q['answer']),
        'withFigure': sum(1 for q in bank if q['hasFigure']),
        'ee': sum(1 for q in bank if q['track']=='ee'),
        'em': sum(1 for q in bank if q['track']=='em'),
        'conceptLike': sum(1 for q in bank if q['kind']=='concept'),
        'notes': '106/108/109 部分題缺答案；分類為關鍵字啟發式（可篩全部專業）。'
    }
    bank_obj = {'meta': meta, 'questions': bank}
    (OUT_EXAM/'bank.json').write_text(json.dumps(bank_obj, ensure_ascii=False), encoding='utf-8')
    write_js(OUT_EXAM/'bank-data.js', '__EXAM_BANK__', bank_obj)
    (OUT_EXAM/'concepts.json').write_text(json.dumps(concepts, ensure_ascii=False), encoding='utf-8')
    write_js(OUT_EXAM/'concepts-data.js', '__EXAM_CONCEPTS__', concepts)

    OUT_ZH.mkdir(parents=True, exist_ok=True)
    zh_obj = {'meta': {'year': 114, 'mc': len(zh114), 'auto': len(zh_auto)}, 'exam114': zh114, 'fromKnowledge': zh_auto}
    (OUT_ZH/'quiz.json').write_text(json.dumps(zh_obj, ensure_ascii=False), encoding='utf-8')
    write_js(OUT_ZH/'quiz-data.js', '__ZH_QUIZ__', zh_obj)

    OUT_EN.mkdir(parents=True, exist_ok=True)
    en_obj = {'meta': {'year': 114, 'total': len(en114), 'recall': len(recall)}, 'exam114': en114, 'recall': recall}
    (OUT_EN/'quiz.json').write_text(json.dumps(en_obj, ensure_ascii=False), encoding='utf-8')
    write_js(OUT_EN/'quiz-data.js', '__EN_QUIZ__', en_obj)

    OUT_MATH.mkdir(parents=True, exist_ok=True)
    math_path = OUT_MATH / 'lessons.json'
    MATH = json.loads(math_path.read_text(encoding='utf-8'))
    write_js(OUT_MATH / 'lessons-data.js', '__MATH_LESSONS__', MATH)

    print('BANK', meta)
    print('CONCEPTS curated', concepts['totals'])
    print('ZH114', len(zh114), 'auto', len(zh_auto))
    print('EN114', len(en114), 'recall', len(recall))
    print('MATH units', len(MATH['units']), 'examples', sum(len(u.get('examples') or []) for u in MATH['units']))

if __name__ == '__main__':
    main()
