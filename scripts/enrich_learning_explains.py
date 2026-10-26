#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Thicken short math worked examples, fix cases line breaks, and format zh/en explains."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def cjk(s):
    return len(re.findall(r'[\u4e00-\u9fff]', s or ''))


def fix_cases(s):
    if not isinstance(s, str) or r'\begin{cases}' not in s:
        return s

    def repl(m):
        inner = m.group(1).strip()
        # Already has a LaTeX row break (two backslashes).
        if '\\\\' in inner:
            return m.group(0)
        parts = [p.strip() for p in re.split(r'\\\s+', inner) if p.strip()]
        if len(parts) < 2:
            return m.group(0)
        body = ' \\\\\n'.join(parts)
        return '\\begin{cases}\n' + body + '\n\\end{cases}'

    return re.sub(r'\\begin\{cases\}(.*?)\\end\{cases\}', repl, s, flags=re.S)


def walk_fix(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str):
                obj[k] = fix_cases(v)
            else:
                walk_fix(v)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            if isinstance(v, str):
                obj[i] = fix_cases(v)
            else:
                walk_fix(v)


# (unit id, example title) -> list of reasons aligned to existing steps.
# Only applied when the current reason is missing or very short.
REASONS = {
    ('arith', '例1'): [
        '運算順序是先乘除、後加減。這裡有兩組乘法，必須分開先算，不能先把中間的 3 和 4 加起來。',
        '兩組乘法都得到積之後，才把兩個積相加，這才是整題的結果。',
    ],
    ('arith', '例2'): [
        '括號裡要先算完。括號內仍是先乘後加，所以先把兩組乘法做出來。',
        '括號內加總之後，再乘上括號外面的 3。外層乘法不能搶在括號之前。',
    ],
    ('arith', '例4'): [
        '中括號裡有兩個小括號，各自先算完。小括號裡一樣先乘除、後加減。',
        '兩個小括號的結果再相加，最後才乘上中括號外面的 3。',
    ],
    ('arith', '變題1'): [
        '題目要先代入已知的電壓、電流，再依先乘後加計算，不要把加法提前。',
        '兩組乘法算完後相加，得到這個代換式的值。',
    ],
    ('percent', '例1'): [
        '小數改成百分率，就是乘上 100，再在後面加 %。乘 100 等於小數點往右移兩位。',
    ],
    ('percent', '例3'): [
        '小數加法要對齊小數點，個位對個位、十分位對十分位，再相加。',
        '小數乘法先當整數乘，再依兩數的小數位數總和點上小數點。1.2 各有一位小數，積要有兩位小數。',
    ],
    ('percent', '例4'): [
        '效率是輸出占輸入的比例。80% 要先改成小數 0.8，再乘輸入功率，才是輸出功率。',
    ],
    ('percent', '例5'): [
        '由最內層括號往外。括號裡先乘後加，除法也在同一層，做完才能再加外面的 8。',
        '中括號全部算完後，最後才除以 100，小數點再往左移兩位。',
    ],
    ('percent', '變題1'): [
        '90% 就是 0.9。輸出功率＝效率 × 輸入功率，所以用小數去乘，不要直接乘 90。',
        '乘完得到的就是輸出功率，單位仍是瓦特。',
    ],
    ('percent', '變題2'): [
        '0.08 的小數點往右移兩位就是 8，所以是 8%。小於 1 的小數，百分率一定小於 100%。',
    ],
    ('frac', '變題1'): [
        '分母不同不能直接加分子。4 和 12 的最小公分母是 12，先把 1/4 擴成 3/12 再相加。',
        '1/R 已經等於 1/3，R 就是這個分數的倒數，所以 R＝3。',
    ],
    ('frac', '變題2'): [
        '除以一個分數等於乘上它的倒數。1/4 的倒數是 4/1，乘完再約分。',
    ],
    ('linear1', '變題2'): [
        '目標是把常數和 x 分開。先在等號兩邊同時加 4，等號仍然成立，常數就移到右邊。',
        'x 前面還有係數 3。兩邊同除以 3，係數變成 1，就得到 x。',
    ],
    ('linear2', '例3'): [
        '兩式的 B 一個是加、一個是減，相加時 +B 與 −B 抵消，只留下 A，這就是加減消去法。',
        '已經知道 A，代回其中一式就能解出 B。用 A+B＝2 最直接。',
    ],
    ('linear2', '例4'): [
        '兩式都有 +Y，用第二式減第一式，Y 會消掉，只剩下 X。相減時右邊也要一起減。',
        'X 求出後代回第一式 X+Y＝4，移項就能得到 Y。',
    ],
    ('linear2', '變題1'): [
        '兩式的 I2 一加一減，相加會消掉 I2，只留下 I1。電流迴路題常用這一招先求一支路。',
        'I1 代回第一式，移項得到 I2。兩電流相加應回到總電流 9，可用來檢查。',
    ],
    ('linear2', '變題2'): [
        '兩式都有 +y，用第一式減第二式，y 消掉，直接得到 x。',
        '把 x 代回第二式 x+y＝7，解出 y。',
    ],
    ('signed', '例4'): [
        '絕對值符號裡面先算完，得到的正負先保留，這一步還不要取絕對值。',
        '絕對值是離 0 的距離，結果一定是非負數。正數不變，負數去掉負號。',
    ],
    ('signed', '例5'): [
        '絕對值等於正數時，括號裡可以是這個正數，也可以是它的相反數，所以要拆成兩條方程式。',
        '兩條一次式各自移項，得到兩個解，都要保留。',
    ],
    ('signed', '變題1'): [
        '電位差是終點電位減起點電位。V_B 是負的，減負數要改成加正數，電位才會變高。',
    ],
    ('signed', '變題2'): [
        '和例題相同：絕對值等於 4，表示括號內是 4 或 −4，兩種都成立。',
        '各自移項。較大的解是 9，較小的是 1。',
    ],
    ('power-root', '例4'): [
        '平方根是在問「哪個非負數平方後等於被開方數」。先寫出對應的平方，避免背錯。',
        '對上之後，根號的值就是那個非負的底數。負數不是算術平方根。',
    ],
    ('power-root', '例5'): [
        '功率公式先處理次方。I² 是電流自己乘自己，不是 2×I。',
        '平方做完再乘電阻。單位是瓦特。',
    ],
    ('power-root', '例6'): [
        '底數都是 10，同底數相乘時指數相加，底數保持 10，不要把底數也乘在一起。',
    ],
    ('power-root', '變題1'): [
        '同樣先算電流的平方。4²＝16，不是 4×2。',
        '再乘上電阻 2，得到消耗功率。',
    ],
    ('power-root', '變題2'): [
        '峰值裡的 √2 和公式分母的 √2 約掉，有效值就等於 110。市電標的 110V 指的是有效值。',
    ],
    ('ratio', '例3'): [
        '比例 a:b＝c:d 的意思是交叉相乘 ad＝bc。這裡 5 對 24、8 對 x，所以 5×24＝8x。',
        'x 的係數是 8，兩邊同除以 8 得到 x。',
    ],
    ('ratio', '例4'): [
        '輸入功率先把電壓和電流乘起來。效率還沒用上之前，這只是進機器的功率。',
        '輸出＝效率 × 輸入。80% 要用小數 0.8，不是乘 80。',
    ],
    ('ratio', '例5'): [
        '並聯時電壓相同，電流和電阻成反比：電阻小的那一路電流大。所以電流比是電阻比的顛倒。',
    ],
    ('ratio', '變題1'): [
        '理想變壓器電壓比等於匝數比。二次側匝數是一次側的 1/3，電壓也是 1/3。',
    ],
    ('ratio', '變題2'): [
        '串聯分壓和電阻成正比。總共 3+5＝8 份，R1 占 3 份，所以拿走總電壓的 3/8。',
    ],
    ('units', '例4'): [
        '科學記號要指數相同才能把係數相加。把 10^4 改寫成 10^3，係數要跟著放大 10 倍。',
        '係數相加後，再把結果調回一位整數的科學記號。',
    ],
    ('units', '例5'): [
        '歐姆定律的標準單位是伏特、安培、歐姆。kΩ 要乘 1000，mA 要乘 0.001，不能帶著字首直接相乘。',
        '單位換好再相乘。2000×0.005＝10，所以壓降是 10 伏特。',
    ],
    ('units', '變題1'): [
        '和上一題相同：先把 mA、kΩ 換成 A 和 Ω，避免少乘或多乘 1000。',
        'I 和 R 都換成基本單位後相乘，得到電壓。',
    ],
    ('geom', '例：讀座標（每格為 1）'): [
        '橫軸是 x、往右為正；縱軸是 y、往上為正。每一格是 1，從原點往左或往下就要寫負號。',
    ],
    ('expand', '例：乘法公式'): [
        '(a+b)² 不是 a²+b²。它要展開成 a²、兩倍的 ab、以及 b² 三項，這裡 b＝2。',
    ],
    ('sci', '例：前綴相乘除'): [
        'k、M、m、μ 先換成 10 的次方，分子、分母分開整理，才不會把字首乘錯。',
        '同底數相除，指數相減。分母是 10 的負次方時，減負數等於加上那個指數。',
    ],
    ('quad', '例：因式分解'): [
        '要找兩個整數，相乘等於常數項 −40、相加等於一次項係數 −3。先用乘積鎖定候選，再用和來確認。',
        '把二次式拆成兩個一次因式。乘積為 0 時，其中一個因式必須是 0，所以各解一次。',
    ],
    ('trig', '例：功率因數'): [
        '電阻和感抗互相垂直，阻抗是斜邊。先用勾股定理把 Z 算出來，後面的 cos 才有分母。',
        '功率因數是實功占視在功率的比例，串聯時等於 R/Z。0.6 小於 1，而且電感負載是電流落後。',
    ],
    ('rc-tau', '例：τ=RC'): [
        '時間常數 τ＝R×C，但 R 要用歐姆、C 要用法拉。kΩ 是 ×10³，μF 是 ×10⁻⁶，要先換進公式。',
        '實務上大約 5 個時間常數視為充放電完成。τ 已經是 1 秒，所以 5τ 是 5 秒。',
    ],
}


WIRE = {
    'intro': '這是一題導線電阻比：直徑改變時，先看截面積怎麼變，再看電阻怎麼變。',
    'kind': '直徑加倍與電阻',
    'givenLabel': '給定關係：',
    'given': r'R\propto\dfrac{L}{A},\quad A=\dfrac{\pi d^{2}}{4}',
    'steps': [
        {
            'title': '看截面積和直徑的關係',
            'reason': '同一條圓導線，截面積 $A=\\pi d^{2}/4$。圓周率是常數，所以 $A$ 和直徑的平方成正比：$A\\propto d^{2}$。直徑變成 2 倍時，要平方，不能只乘 2。',
            'calcs': [r'A\propto d^{2}', r'(2d)^{2}=4d^{2}', r'\text{面積變為原來的 }4\text{ 倍}'],
        },
        {
            'title': '看電阻和截面積的關係',
            'reason': '材質、長度不變時，$R=\\rho L/A$，所以電阻和截面積成反比：$R\\propto 1/A$。面積變成 4 倍，電阻就變成原來的 $1/4$。',
            'calcs': [r'R\propto\dfrac{1}{A}', r'R\times\dfrac{1}{4}'],
        },
    ],
    'answer': r'\text{電阻變為原來的 }\dfrac{1}{4}\text{ 倍}',
}

FULL_EXAMPLES = {
    ('wire-r', '例：直徑加倍'): WIRE,
    ('quad', '例：因式分解'): {
        'intro': '這是一題一元二次方程式，用因式分解來解，不套公式也行。',
        'kind': '一元二次因式分解',
        'givenLabel': '給定方程式：',
        'steps': [
            {
                'title': '找兩個數',
                'reason': 'x²−3x−40 要拆成 (x+p)(x+q)。p、q 相乘要等於常數項 −40，相加要等於一次項係數 −3。',
                'calcs': [r'(-8)\times 5=-40', r'(-8)+5=-3'],
            },
            {
                'title': '寫成因式',
                'reason': '對上的兩個數是 −8 和 5，所以可以分解。因式裡的符號跟這兩個數相同。',
                'calcs': [r'(x-8)(x+5)=0'],
            },
            {
                'title': '各因式分別為 0',
                'reason': '兩個因式相乘等於 0，表示至少有一個是 0。兩種情形都是解，不能只留一個。',
                'calcs': [r'x-8=0\Rightarrow x=8', r'x+5=0\Rightarrow x=-5'],
            },
        ],
    },
    ('trig', '例：功率因數'): {
        'intro': '這是一題串聯電阻與感抗的功率因數，先求阻抗斜邊，再取餘弦。',
        'kind': '功率因數',
        'givenLabel': '給定：',
        'steps': [
            {
                'title': '用阻抗三角形求 Z',
                'reason': '電阻 R 和感抗 XL 方向垂直，阻抗 Z 是斜邊。先用勾股定理，後面才有分母。',
                'calcs': [r'Z=\sqrt{R^{2}+X_L^{2}}=\sqrt{6^{2}+8^{2}}=\sqrt{36+64}=\sqrt{100}=10\,\Omega'],
            },
            {
                'title': '功率因數＝R/Z',
                'reason': '功率因數 $\\cos\\theta$ 是實功占視在功率的比例。串聯電路裡它等於電阻除以阻抗。電感電路的電流落後電壓，所以是落後 0.6。',
                'calcs': [r'\cos\theta=\dfrac{R}{Z}=\dfrac{6}{10}=0.6'],
            },
        ],
        'answer': r'0.6\text{（電流落後）}',
    },
    ('rc-tau', '例：τ=RC'): {
        'intro': '這是一題 RC 時間常數。先把單位換成歐姆和法拉，再相乘。',
        'kind': 'RC 時間常數',
        'givenLabel': '給定：',
        'steps': [
            {
                'title': '先換單位再相乘',
                'reason': 'τ＝RC 的單位是秒，但前提是 R 用歐姆、C 用法拉。10 kΩ＝10×10³ Ω，100 μF＝100×10⁻⁶ F。k 和 μ 乘在一起會變成 10⁻³，再乘係數 10×100。',
                'calcs': [r'\tau=10\times 10^{3}\times 100\times 10^{-6}', r'=1000\times 10^{-3}=1\,\mathrm{s}'],
            },
            {
                'title': '大約 5τ 視為充完',
                'reason': '一個時間常數大約充到 63%。實務上把 5τ 當作暫態結束、接近穩態，所以再乘 5。',
                'calcs': [r'5\tau=5\times 1=5\,\mathrm{s}'],
            },
        ],
    },
    ('expand', '例：乘法公式'): {
        'intro': '這是一題完全平方。平方不能只平方前後兩項，中間的交叉項要留著。',
        'kind': '完全平方公式',
        'givenLabel': '給定算式：',
        'steps': [
            {
                'title': '寫出公式在做什麼',
                'reason': '$(a+b)^{2}$ 是 (a+b) 乘自己兩次。交叉相乘會多出兩項 ab，合起來是 2ab。這裡 b＝2，所以中間項是 2×a×2。',
                'calcs': [r'(a+b)^{2}=a^{2}+2ab+b^{2}', r'b=2'],
            },
            {
                'title': '代入 b＝2',
                'reason': 'b²＝4，2ab＝4a。三項都要留下，不能寫成 a²+4。',
                'calcs': [r'(a+2)^{2}=a^{2}+2\cdot a\cdot 2+2^{2}', r'=a^{2}+4a+4'],
            },
        ],
    },
    ('sci', '例：前綴相乘除'): {
        'intro': '這是一題字首相乘除。先把 k、M、m、μ 全部換成 10 的次方，再處理指數。',
        'kind': '前綴與指數律',
        'givenLabel': '給定算式：',
        'steps': [
            {
                'title': '分子換成 10 的次方',
                'reason': 'k＝10³、M＝10⁶。同底數相乘，指數相加，係數 2×3 另外乘。',
                'calcs': [r'2\,\mathrm{k}\times 3\,\mathrm{M}=2\times 10^{3}\times 3\times 10^{6}=6\times 10^{9}'],
            },
            {
                'title': '分母換成 10 的次方',
                'reason': 'm＝10⁻³、μ＝10⁻⁶。兩個負指數相加，分母變成很小數。',
                'calcs': [r'1\,\mathrm{m}\times 5\,\mu=1\times 10^{-3}\times 5\times 10^{-6}=5\times 10^{-9}'],
            },
            {
                'title': '分子除以分母',
                'reason': '係數 6÷5＝1.2。指數是 9−(−9)：減負數等於加，所以指數加 9。',
                'calcs': [r'\dfrac{6\times 10^{9}}{5\times 10^{-9}}=\dfrac{6}{5}\times 10^{9-(-9)}=1.2\times 10^{18}'],
            },
        ],
    },
    ('geom', '例：讀座標（每格為 1）'): {
        'intro': '這是一題讀座標。先定原點和正方向，再一格一格數，往左、往下要加負號。',
        'kind': '座標平面',
        'givenLabel': '給定：',
        'steps': [
            {
                'title': '先定方向',
                'reason': '橫軸是 x，往右為正、往左為負。縱軸是 y，往上為正、往下為負。題目說每一格是 1，數幾格就寫幾。',
                'calcs': [r'\text{右 }+x\text{、左 }-x\text{、上 }+y\text{、下 }-y'],
            },
            {
                'title': '逐點讀出',
                'reason': 'A 在原點，兩個座標都是 0。B 在橫軸左側 3 格，所以 x＝−3、y＝0。C 往右 3、往上 4。D 往左 4、往下 3。E 在縱軸下方 5 格。',
                'calcs': [r'A=(0,0),\ B=(-3,0)', r'C=(3,4),\ D=(-4,-3),\ E=(0,-5)'],
            },
        ],
    },
}


def apply_example_reasons(data):
    filled = 0
    replaced = 0
    for unit in data['units']:
        for ex in unit.get('examples') or []:
            key = (unit['id'], ex.get('title'))
            if key in FULL_EXAMPLES:
                ex.update(FULL_EXAMPLES[key])
                replaced += 1
                continue
            reasons = REASONS.get(key)
            if not reasons:
                continue
            for i, step in enumerate(ex.get('steps') or []):
                if i >= len(reasons):
                    break
                if cjk(step.get('reason') or '') < 12:
                    step['reason'] = reasons[i]
                    filled += 1
    return filled, replaced


def why_for(unit, stem, rest, idx):
    s = stem or ''
    r = rest or ''
    blob = s + r
    if unit == 'arith':
        if '\\div' in r or '÷' in r:
            return '同一層先做除法，再處理加減：'
        if '\\times' in r or '×' in r:
            return '括號內以及乘除要先算，這一步先把乘法做出來：'
        return '乘除做完才做加減，把上一步的結果加總：'
    if unit == 'percent':
        if '\\%' in blob or '%' in blob:
            return '小數化百分率要乘 100（小數點右移兩位），再加 %：'
        if '效率' in s or 'eta' in s or '\\eta' in s:
            return '效率先改成小數再乘輸入功率，得到的才是輸出：'
        if '\\div 10' in blob or '÷10' in blob or '\\div10' in blob:
            return '除以 10 時，小數點往左移一位：'
        if '\\times 10' in blob or '×10' in blob:
            return '乘以 10 時，小數點往右移一位：'
        return '小數先對齊小數點或先處理括號，再做四則：'
    if unit == 'frac':
        if '\\div' in blob:
            return '除以分數要改成乘倒數，再約分：'
        if '並聯' in s or 'dfrac{1}{R}' in s or '1}{R}' in s:
            return '並聯先把 1/R 的分數通分相加，R 是這個和的倒數：'
        return '分母不同要先通分；分母相同才能把分子相加減或相乘：'
    if unit == 'linear1':
        if '歐姆' in s or 'V=' in s or 'I=' in s:
            return '歐姆定律先把要求的那個量移到一邊，再代入數字：'
        return '等號兩邊做同一件事，先把常數和未知數分開，再把係數化成 1：'
    if unit == 'linear2':
        if '相加' in r:
            return '兩式相加是為了讓符號相反的那個未知數抵消：'
        if '相減' in r:
            return '兩式相減是為了消去係數相同的那個未知數：'
        if '代' in r:
            return '一個未知數求出後代回任一式，移項得到另一個：'
        return '先消去一個未知數，再代回求剩下的那個：'
    if unit == 'signed':
        return '先看同號還是異號：同號就絕對值相加並保留符號，異號用大減小、跟絕對值大的那個同號。減負數要先改成加正數：'
    if unit == 'power-root':
        if 'sqrt' in blob or '根' in s:
            return '算術平方根要找非負數，平方後等於被開方數：'
        if '有效' in s or 'rms' in blob:
            return '有效值是峰值除以 √2；分子分母都有 √2 時可以約掉：'
        return '次方是連乘，先把指數展開再相乘；同底數相乘則指數相加：'
    if unit == 'ratio':
        if '效率' in s:
            return '輸出功率＝效率（小數）× 輸入功率：'
        if '匝' in s or '分壓' in s or '電流比' in s or '並聯' in s:
            return '先判斷成正比還是成反比，再按份數或交叉相乘：'
        return '比例式用交叉相乘變成方程式，再把未知數的係數化成 1：'
    if unit == 'units':
        return '先把 k、m、μ、M 換成 10 的次方，再用基本單位相乘或相除：'
    if unit == 'geom':
        return '先分清 x、y 和正方向，距離用勾股定理，差的平方再相加開根號：'
    if unit == 'expand':
        return '先看是分配律還是乘法公式。平方要留下中間的 2ab，不能只平方兩頭：'
    if unit == 'sci':
        return '同底數相乘指數相加、相除指數相減；字首先換成 10 的次方再算：'
    if unit == 'quad':
        return '先看是開平方、因式分解還是判別式。乘積為 0 時每個因式各解一次：'
    if unit == 'trig':
        return '先寫出定義（功率因數＝P/S 或 R/Z），再代入數字：'
    if unit == 'wire-r':
        return '先用 R∝L/A 判斷長度、面積誰在變；圓導線面積正比於直徑平方：'
    if unit == 'rc-tau':
        return 'τ＝RC 或 L/R。電阻用法拉、電感用亨利之前，k、m、μ 要先換掉：'
    return '先說這一步在消掉什麼或在換什麼單位，再寫算式：'


WIRE_PRACTICE = {
    '同材質導線長度加倍': (
        '步驟一：同一材質、截面積不變時，電阻和長度成正比，$R\\propto L$。長度變成 2 倍，電阻也變成 2 倍，跟直徑無關。\n'
        '最終答案：$\\text{變 }2\\text{ 倍}$。'
    ),
    '長度相同，直徑加倍': (
        '步驟一：圓導線截面積 $A\\propto d^{2}$。直徑加倍時，$(2d)^{2}=4d^{2}$，面積變成 4 倍。\n'
        '步驟二：長度、材質不變時 $R\\propto 1/A$。面積 4 倍，電阻變成原來的 $1/4$。\n'
        '最終答案：$\\dfrac{1}{4}\\text{ 倍}$。'
    ),
    '均勻拉長為 $2$ 倍': (
        '步驟一：體積不變，長度變成 2 倍，截面積就只剩 $1/2$（同一批銅被拉細）。\n'
        '步驟二：$R\\propto L/A$，長度 ×2、面積 ÷2，電阻變成 $2\\div(1/2)=4$ 倍。$4\\,\\Omega\\times 4=16\\,\\Omega$。\n'
        '最終答案：$16\\,\\Omega$。'
    ),
    '對折成雙股': (
        '步驟一：對折後長度變一半、兩股並排等於截面積變 2 倍。\n'
        '步驟二：$R\\propto L/A$，所以乘上 $1/2$（長度）再乘上 $1/2$（面積變大），$10\\times\\dfrac{1}{4}=2.5\\,\\Omega$。\n'
        '最終答案：$2.5\\,\\Omega$。'
    ),
    '直徑變 $\\dfrac{1}{2}$': (
        '步驟一：面積正比於直徑平方。直徑變 $1/2$ 時，面積變成 $(1/2)^{2}=1/4$。\n'
        '步驟二：$R\\propto 1/A$，面積只剩 $1/4$，電阻變成 4 倍。\n'
        '最終答案：$4\\text{ 倍}$。'
    ),
}


def enrich_practice(unit_id, item):
    stem = item.get('stem') or ''
    explain = item.get('explain') or ''
    if unit_id == 'wire-r':
        for key, text in WIRE_PRACTICE.items():
            if key in stem:
                item['explain'] = text
                return True
    body = re.sub(r'最終答案.*', '', explain, flags=re.S)
    body2 = re.sub(r'步驟[一二三四五六七八九十]+：?', '', body)
    if cjk(body2) >= 8 and unit_id not in ('wire-r',):
        return False
    lines = [ln.strip() for ln in explain.split('\n') if ln.strip()]
    out = []
    idx = 0
    changed = False
    for line in lines:
        m = re.match(r'(步驟[一二三四五六七八九十]+：)\s*(.*)', line)
        if not m:
            out.append(line)
            continue
        label, rest = m.group(1), m.group(2).strip()
        if cjk(rest) >= 8:
            out.append(line)
        else:
            why = why_for(unit_id, stem, rest, idx)
            if why and why not in rest:
                out.append(f'{label}{why}{rest}')
                changed = True
            else:
                out.append(line)
        idx += 1
    if changed:
        item['explain'] = '\n'.join(out)
    return changed


ZH_EXAM = {
    '114-zh-mc-1': '正解：C　賤別好友\n「賤」是低賤，「餞」才是送行的酒宴，所以「賤別」是錯字，應寫「餞別」。\n其他選項：A. 實踐諾言，用字正確。B. 水花四濺，「濺」是液體飛起，正確。D. 寄送信箋，「箋」是信紙，正確。\n最終答案：C',
    '114-zh-mc-2': '正解：A　瑜∕逾∕覦\n三個空依序是「瑕不掩瑜」（玉的光彩蓋過小斑）、「逾時不候」（超過時間就不等）、「覬覦」（非分的企圖）。\n其他選項：B、C、D 把這三個字形打亂，讀起來都不是成語。\n最終答案：A',
    '114-zh-mc-3': '正解：C　樂\n《論語》原文是「知之者不如好之者，好之者不如樂之者」。樂在其中，比只是喜歡又高一層。\n其他選項：A. 惡、B. 善、D. 哀都不是這句的用字。\n最終答案：C',
    '114-zh-mc-4': '正解：B　祝賀生子：弄璋誌喜\n弄璋是生男孩的賀詞。題辭要對場合。\n其他選項：A. 妙筆生花用於文才，不是結婚。C. 美輪美奐用於房屋華麗，不是當選。D. 天作之合用於婚姻，不是畢業。\n最終答案：B',
    '114-zh-mc-5': '正解：D　既以為人，己愈有；既以與人，己愈多\n這句出自《老子》，意思是盡量幫人、給人，自己反而更充足，正是勸人盡力助人。\n其他選項：A. 說沒時間讀書的人，有空也不會讀。B. 寫思念、執著。C. 勸人珍惜光陰。都不是助人。\n最終答案：D',
    '114-zh-mc-6': '正解：D　近悅遠來\n近悅遠來指出門的人高興、遠方的人也來，用來賀開店、生意。\n其他選項：A. 杏林春暖賀醫。B. 名山事業賀出書。C. 百工居肆偏工匠開業，不如近悅遠來貼近餐廳迎客。\n最終答案：D',
    '114-zh-mc-7': '正解：B　劉邦\n沛是劉邦起兵的地方，沛公就是劉邦。項莊舞劍，真正想殺的是劉邦。\n其他選項：A. 劉備是三國人物。C. 項羽是項莊那邊的主公。D. 張良是劉邦的謀士，不是沛公這個稱呼本身。\n最終答案：B',
    '114-zh-mc-8': '正解：A　用奇謀孔明借箭，獻密計黃蓋受刑\n孔明、黃蓋都是《三國演義》赤壁的人物。\n其他選項：B. 武松、潘金蓮是《水滸傳》。C. 明湖居說書是《老殘遊記》。D. 唐三藏、芭蕉扇是《西遊記》。\n最終答案：A',
    '114-zh-mc-9': '正解：C　舞幽壑之潛蛟，泣孤舟之嫠婦\n這兩句寫簫聲讓深谷蛟龍起舞、讓孤舟寡婦哭泣，說的是音樂的感染和哀傷。\n其他選項：A. 寫江上夜景。B. 是曹操詩句，寫月夜烏鵲。D. 寫人在天地間的渺小。都不是在寫音樂。\n最終答案：C',
    '114-zh-mc-10': '正解：D　夫仁者，己欲立而立人，己欲達而達人\n行仁的人，自己想站得住，也幫別人站得住；自己想通達，也幫別人通達。這句解釋正確。\n其他選項：A. 「鮮矣仁」是很少有仁，不是最有仁心。B. 「君子固窮」是窮困仍守正，不是本來就該窮。C. 「患不知人」是怕不了解別人，不是怕比不上別人。\n最終答案：D',
    '114-zh-mc-11': '正解：A　ㄍㄣˋ\n「亙」讀ㄍㄣˋ，亙古就是從古到今。不要讀成ㄍㄥˋ。\n其他選項：B. ㄍㄥˋ、C. ㄏㄥˊ、D. ㄏㄨㄢˊ都不是這個字的讀音。\n最終答案：A',
    '114-zh-mc-12': '正解：D　生氣\n「慍」是怒、不高興。面有慍色就是臉上帶著生氣。\n其他選項：A. 悲傷、B. 喜悅、C. 擔憂都不是慍的意思。\n最終答案：D',
    '114-zh-mc-13': '正解：A　開會時大家各說各話，最後仍「莫衷一是」，決定擇期再議\n莫衷一是是大家意見很多、沒有統一結論，用在開會各說各話是對的。\n其他選項：B. 如坐針氈是坐立不安，不是興奮。C. 寥寥可數是很少，不能形容人太多。D. 美輪美奐多形容建築華麗，不形容人的打扮。\n最終答案：A',
    '114-zh-mc-14': '正解：B　俎\n成語是「越俎代庖」。俎是祭器，代庖是替廚子做事，合起來比喻越過自己的職分。\n其他選項：A. 祖、C. 阻、D. 詛都是同音別字。\n最終答案：B',
    '114-zh-mc-15': '正解：C　戲曲演員\n唐玄宗在梨園教樂工，後來「梨園子弟」就指戲曲演員。\n其他選項：A. 知識分子、B. 富貴人家、D. 正人君子都不是這個典故。\n最終答案：C',
    '114-zh-mc-16': '正解：D　斃\n成語是「多行不義必自斃」，出自《左傳》，意思是壞事做多了會自己垮掉。\n其他選項：A. 滅、B. 亡、C. 弊意思接近，但成語用字是「斃」。\n最終答案：D',
    '114-zh-mc-17': '正解：C　孝順\n羊羔跪著吃奶、烏鴉長大反哺，都是用來比喻子女回報父母，講的是孝。\n其他選項：A. 感恩太寬、B. 守信、D. 謙虛都不是這兩則比喻的重點。\n最終答案：C',
    '114-zh-mc-18': '正解：D　酒\n杜康是傳說中造酒的人，詩裡用他的名字借代酒。何以解憂，意思是拿酒來解悶。\n其他選項：A. 歌、B. 友、C. 茶都不是杜康的代稱。\n最終答案：D',
    '114-zh-mc-19': '正解：B　射箭\n揖讓而升、射完下堂飲酒，比的是射禮。爭的是技藝，態度仍是君子。\n其他選項：A. 飲酒只是射完的禮，不是這句在描述的活動本身。C. 彈琴、D. 駕車都沒有「升堂比射」的程序。\n最終答案：B',
    '114-zh-mc-20': '正解：A　十二\n地支是子丑寅卯辰巳午未申酉戌亥，共十二個。天干是十個，干支配起來才是六十甲子。\n其他選項：B. 十是天干的數目。C. 六十是干支組合。D. 廿四是節氣，不是地支。\n最終答案：A',
}


EN = {
    '114-en-vocab-21': {
        'zh': '我上週寫了一封信給 Mary，但她到現在還沒回。',
        'rows': [
            ('respond to', '回應、回覆。respond to a letter＝回信，所以空格用 responded。'),
            ('communicated', '溝通。通常說 communicate with someone，不說 communicate to a letter。'),
            ('disappointed', '使失望，語意和文法都接不上 to it。'),
            ('related', '與…相關，不是回信。'),
        ],
        'answer': 'B',
        'word': 'responded',
    },
    '114-en-vocab-22': {
        'zh': '我喜歡模型車，而且已經收集了很多。',
        'rows': [
            ('be fond of', '喜歡。空格在 am 和 of 中間，用 fond。'),
            ('embarrassing', '令人尷尬，不能說 am embarrassing of。'),
            ('cultural', '文化的，不接 of 表示喜好。'),
            ('valuable', '有價值的，模型車可以很有價值，但空格文法不成立。'),
        ],
        'answer': 'A',
        'word': 'fond',
    },
    '114-en-vocab-23': {
        'zh': '畫廊主人稱讚這位年輕藝術家眼光獨特，跟以前看過的都不一樣。',
        'rows': [
            ('special', '特別的、獨特的，才接得上 unlike anything seen before。'),
            ('common', '普通的，和「前所未見」相反。'),
            ('regular', '規律的、普通的，不是獨特。'),
            ('general', '一般的，同樣相反。'),
        ],
        'answer': 'D',
        'word': 'special',
    },
    '114-en-vocab-24': {
        'zh': '這位年輕服務生很笨手笨腳，晚餐尖峰時不小心打破了三個盤子。',
        'rows': [
            ('clumsy', '笨拙、手腳不靈活，才會打破盤子。'),
            ('greasy', '油膩的。'),
            ('mighty', '強大的。'),
            ('sticky', '黏的。這三個都解釋不了 accidentally broke。'),
        ],
        'answer': 'C',
        'word': 'clumsy',
    },
    '114-en-vocab-25': {
        'zh': '許多在地團體正努力保存傳統語言，以免它們完全消失。',
        'rows': [
            ('preserve', '保存、保護，後面接到語言消失之前，語意通。'),
            ('scatter', '驅散、散開。'),
            ('motivate', '激勵某人，不直接接 languages。'),
            ('volunteer', '自願去做，這裡需要的是及物動詞加語言。'),
        ],
        'answer': 'A',
        'word': 'preserve',
    },
    '114-en-vocab-26': {
        'zh': '最近的全球金融危機造成嚴重通貨膨脹，什麼東西都變貴了。',
        'rows': [
            ('inflation', '通貨膨脹，後面 making everything more expensive 就是在解釋它。'),
            ('solution', '解決方案，不會讓東西變貴。'),
            ('condition', '狀況，太籠統，接不上變貴。'),
            ('objection', '反對、異議。'),
        ],
        'answer': 'B',
        'word': 'inflation',
    },
    '114-en-vocab-27': {
        'zh': '每個人都應該試著為環境保護出一份力。',
        'rows': [
            ('contribute to', '對…有貢獻。空格後面是 to the efforts。'),
            ('displeases', '使不高興，第三人稱單數也不能接在 should try to 後面。'),
            ('alternates', '交替，不接 to the efforts 表示參與。'),
            ('invades', '入侵，語意相反。'),
        ],
        'answer': 'D',
        'word': 'contribute',
    },
    '114-en-grammar-28': {
        'zh': '喝太多含糖飲料可能會傷害健康。',
        'rows': [
            ('Drinking', '動名詞當主詞，把「喝」這件事當成一件事。'),
            ('Drink / Drank', '原形或過去式不能單獨當這句的主詞。'),
            ('Is drinking', '進行式動詞片語，缺少主詞，也不能放在句首當主詞。'),
        ],
        'answer': 'C',
        'word': 'Drinking',
    },
    '114-en-grammar-29': {
        'zh': '這位學生考得很差，因為她讀得不夠。',
        'rows': [
            ('badly', 'performed badly＝表現差。because 後面說沒讀，所以是差，不是好。'),
            ('cheaply', '便宜地，不形容考試表現。'),
            ('hardly', '幾乎不。performed hardly 不是「很努力」。'),
            ('shortly', '不久、簡短地。'),
        ],
        'answer': 'D',
        'word': 'badly',
    },
    '114-en-grammar-30': {
        'zh': '大眾運輸變好之後，城裡的人開的車比以前少。',
        'rows': [
            ('fewer', 'cars 是可數複數，比較級用 fewer。'),
            ('less', '修飾不可數名詞，不修飾 cars。'),
            ('lower', '較低，不跟 cars 的數量搭配。'),
            ('more', '更多，和「交通變好所以少開車」相反。'),
        ],
        'answer': 'B',
        'word': 'fewer',
    },
    '114-en-grammar-31': {
        'zh': '我不知道這項新政策最後會變成什麼樣子。',
        'rows': [
            ('what will become of', '固定說法，問某事物會落得如何。'),
            ('who / where / why', '都不能接 become of 這個句型。'),
        ],
        'answer': 'A',
        'word': 'what',
    },
    '114-en-grammar-32': {
        'zh': '你應該事先訂票，才能確保拿到最好的位子。',
        'rows': [
            ('in advance', '事先、預先。'),
            ('in address', '不是英文片語。'),
            ('in amount', '不是「事先」。'),
            ('in account', '不是這個意思；on account of 才是「因為」。'),
        ],
        'answer': 'A',
        'word': 'in advance',
    },
    '114-en-grammar-33': {
        'zh': 'Mary 每天練英文，好提升語言能力。',
        'rows': [
            ('on a daily basis', '固定片語：每天、按日。介系詞用 on。'),
            ('in / at / for a daily basis', '這三個介系詞都不接 a daily basis。'),
        ],
        'answer': 'C',
        'word': 'on',
    },
    '114-en-grammar-34': {
        'zh': '走失的男孩不知道自己在哪裡，於是哭了起來。',
        'rows': [
            ('where he was', '間接問句用直述語序：疑問詞 + 主詞 + 動詞。'),
            ('where was he', '這是直接問句的倒裝，嵌進 know 後面要改回來。'),
            ('he was where / he where was', '語序不對。'),
        ],
        'answer': 'D',
        'word': 'where he was',
    },
    '114-en-dialogue-35': {
        'zh': 'A：我要一杯熱咖啡。B：好的，請問要怎麼喝？A：黑咖啡，不要糖。',
        'rows': [
            ('How do you like your coffee', '問糖和奶怎麼加。下一句 Black coffee, no sugar 正好在回答。'),
            ('What size would you like', '問尺寸，答不出黑咖啡。'),
            ('What about cold coffee', '客人已經點熱的，不該改推冷的當唯一問題。'),
            ('Do you want to come back later', '和後句的口味回答接不上。'),
        ],
        'answer': 'D',
        'word': 'How do you like your coffee',
    },
    '114-en-dialogue-36': {
        'zh': 'A：這電影快把我看得睡著。B：你在開玩笑吧！這是我看過最棒的電影。',
        'rows': [
            ('You must be joking', '表示不敢相信對方的負評，後面才接自己覺得超好看。'),
            ("You're telling me / You can say that again", '都是強烈同意，會變成也覺得電影很無聊，和後句矛盾。'),
            ("You've got a deal", '成交，用在這段對話不成立。'),
        ],
        'answer': 'C',
        'word': 'You must be joking',
    },
    '114-en-dialogue-37': {
        'zh': 'A：我們去看市區的新展覽吧。B：我很想去，可是沒辦法。A：為什麼不行？B：我得把學校作業做完。',
        'rows': [
            ("I'd love to, but I can't", '先婉拒。A 接著問 Why not，B 才補理由。'),
            ('Sure / Great', '是答應，後面不會再問 Why not。'),
            ('I went there last week', '沒有拒絕，也接不上 Why not。'),
        ],
        'answer': 'A',
        'word': "I'd love to, but I can't",
    },
    '114-en-dialogue-38': {
        'zh': 'A：Stella 的芭蕾表演很精彩。B：她學芭蕾多久了？A：從七歲開始。',
        'rows': [
            ('How long has she been learning ballet', 'Since she was seven 回答的是一段時間的起點，所以問 how long。'),
            ('How old do people start', '問的是一般人幾歲開始，不是她學了多久。'),
            ('How often', '問頻率，回答不會是 Since。'),
            ('How much will you pay', '問票價，完全接不上。'),
        ],
        'answer': 'B',
        'word': 'How long has she been learning ballet',
    },
    '114-en-dialogue-39': {
        'zh': 'A：隊伍太長了，我們插隊才能準時進場。B：你怎麼會提出這種主意？A：好吧，那我們去排最後面。',
        'rows': [
            ('How could you suggest that', '責備插隊。A 才改口說去排後面。'),
            ('Which theater / Which movie / How much', '都是在問場次或票價，接不上「那我們去排最後」。'),
        ],
        'answer': 'C',
        'word': 'How could you suggest that',
    },
    '114-en-dialogue-40': {
        'zh': 'A：你昨天的演講太精彩了，我好佩服。B：謝謝，我很感激。其實我花了很多心力。',
        'rows': [
            ('I appreciate that', '接受稱讚並道謝，再補自己很用心。'),
            ("I can't believe it", '不像在接受稱讚。'),
            ('I knew you could do that / I love your speech', '變成 B 在稱讚 A，可是被稱讚的人是 B。'),
        ],
        'answer': 'B',
        'word': 'I appreciate that',
    },
}


def en_text(spec):
    rows = '\n'.join(f'- {name}：{gloss}' for name, gloss in spec['rows'])
    return f"整句中譯：{spec['zh']}\n片語／單字：\n{rows}\n正解：{spec['answer']}　{spec['word']}"


def upgrade_zh_knowledge(q):
    if (q.get('explain') or '').startswith('正解：'):
        return False
    letter = q.get('answer') or ''
    choice_map = {}
    for c in q.get('choices') or []:
        m = re.match(r'^([A-D])[.\s、．]+(.*)$', str(c).strip())
        if m:
            choice_map[m.group(1)] = m.group(2).strip()
    correct = choice_map.get(letter, '')
    others = [f'{k}. {choice_map[k]}' for k in 'ABCD' if k != letter and k in choice_map]
    core = (q.get('explain') or '').strip()
    q['explain'] = (
        f'正解：{letter}　{correct}\n'
        f'{core}\n'
        f'其他選項：{"；".join(others)}。這些是別的讀音或別條成語的說法，不是本題正解。\n'
        f'最終答案：{letter}'
    )
    return True


def upgrade_languages():
    zh_path = ROOT / 'data/zh/quiz.json'
    en_path = ROOT / 'data/en/quiz.json'
    zh = json.loads(zh_path.read_text(encoding='utf-8'))
    en = json.loads(en_path.read_text(encoding='utf-8'))
    n_zh = 0
    for q in zh.get('exam114') or []:
        if q['id'] in ZH_EXAM:
            q['explain'] = ZH_EXAM[q['id']]
            n_zh += 1
    n_know = 0
    for q in zh.get('fromKnowledge') or []:
        if upgrade_zh_knowledge(q):
            n_know += 1
    n_en = 0
    for q in en.get('exam114') or []:
        spec = EN.get(q['id'])
        if spec:
            q['explain'] = en_text(spec)
            n_en += 1
    n_recall = 0
    for c in en.get('recall') or []:
        spec = EN.get(c.get('source') or '')
        if spec:
            c['explain'] = en_text(spec)
            n_recall += 1
    zh_path.write_text(json.dumps(zh, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    en_path.write_text(json.dumps(en, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write_js(ROOT / 'data/zh/quiz-data.js', '__ZH_QUIZ__', zh)
    write_js(ROOT / 'data/en/quiz-data.js', '__EN_QUIZ__', en)
    return n_zh, n_know, n_en, n_recall


def figure_note(q):
    letter = q.get('answer') or ''
    choice = ''
    for c in q.get('choices') or []:
        if str(c).strip().startswith(letter + '.') or str(c).strip().startswith(letter + ' '):
            choice = str(c).strip()
            break
    return (
        f'正解：{letter}　{choice}\n'
        '步驟一：這題的電阻、電源或相量數值畫在附圖上，題幹文字沒有完整抄出。這裡不另編一組圖上沒有寫明的數字。\n'
        '步驟二：對著附圖先辨認串聯、並聯或戴維寧等效，再套歐姆定律、分壓分流或功率公式。圖上每一個數都要讀到，再代入。\n'
        f'最終答案：{letter}（與歷屆公布答案一致）。若附圖缺漏、看不清數值，就不要自行假設。'
    )


def upgrade_figure_bank():
    path = ROOT / 'data/exam/bank.json'
    bank = json.loads(path.read_text(encoding='utf-8'))
    n = 0
    for q in bank['questions']:
        ex = q.get('explain') or ''
        if '請對照附圖' in ex or '自行驗算' in ex:
            q['explain'] = figure_note(q)
            n += 1
    path.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write_js(ROOT / 'data/exam/bank-data.js', '__EXAM_BANK__', bank)
    return n


def write_js(path, var, obj):
    path.write_text(f'window.{var} = {json.dumps(obj, ensure_ascii=False)};\n', encoding='utf-8')


def main():
    math_path = ROOT / 'data/math/lessons.json'
    data = json.loads(math_path.read_text(encoding='utf-8'))
    walk_fix(data)
    filled, replaced = apply_example_reasons(data)
    practice_n = 0
    by_unit = {}
    for unit in data['units']:
        c = 0
        for item in unit.get('practice') or []:
            if enrich_practice(unit['id'], item):
                c += 1
                practice_n += 1
        if c:
            by_unit[unit['id']] = c
    # second pass: empty reasons get a unit-level why; short reasons keep their own words
    still = 0
    for unit in data['units']:
        for ex in unit.get('examples') or []:
            for i, step in enumerate(ex.get('steps') or []):
                reason = (step.get('reason') or '').strip()
                if reason:
                    continue
                step['reason'] = why_for(unit['id'], ex.get('given') or '', ' '.join(step.get('calcs') or []), i)
                still += 1
    math_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write_js(ROOT / 'data/math/lessons-data.js', '__MATH_LESSONS__', data)
    n_zh, n_know, n_en, n_recall = upgrade_languages()
    n_fig = upgrade_figure_bank()
    # verify cases
    bad = []
    def check(obj, path=''):
        if isinstance(obj, dict):
            for k, v in obj.items():
                check(v, path + '.' + k)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                check(v, f'{path}[{i}]')
        elif isinstance(obj, str) and r'\begin{cases}' in obj:
            if '\\\\' not in obj:
                bad.append(path)
    check(data)
    print('reasons filled', filled, 'examples replaced', replaced, 'fallback reasons', still)
    print('practice enriched', practice_n, by_unit)
    print('zh exam', n_zh, 'zh knowledge', n_know, 'en', n_en, 'recall', n_recall, 'fig', n_fig)
    print('bad cases', bad)


if __name__ == '__main__':
    main()
