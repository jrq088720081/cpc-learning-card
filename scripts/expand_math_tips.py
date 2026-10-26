#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Expand math lessons + build tips; attribute 靜心電學教室 items."""
import json
from pathlib import Path

ROOT = Path('/workspace/mistake-notebook')
SRC = '靜心電學教室'
NOTE_ADAPT = '習題改編'
NOTE_SUM = '摘要改寫'
SELF = '自編'

def src(note=NOTE_ADAPT):
    return {'source': SRC, 'sourceNote': note}

def self_src():
    return {'source': SELF, 'sourceNote': '本卡自編'}

def ex(title, kind, given, steps, answer, intro=None, givenLabel='給定算式：', from_src=True, stretch=False):
    d = {
        'title': ('【延伸】' + title) if stretch else title,
        'kind': kind,
        'intro': intro or f'這是一題{kind}，我們一步一步來計算：',
        'givenLabel': givenLabel,
        'given': given,
        'steps': steps,
        'answer': answer,
    }
    d.update(src() if from_src else self_src())
    return d

def pr(stem, choices, answer, explain, from_src=True, stretch=False):
    d = {
        'stem': ('【延伸】' if stretch else '') + stem,
        'choices': choices,
        'answer': answer,
        'explain': explain,
    }
    d.update(src() if from_src else self_src())
    return d

def step(title, reason, calcs):
    return {'title': title, 'reason': reason, 'calcs': calcs}

# ---------- load existing ----------
math_path = ROOT / 'data/math/lessons.json'
data = json.loads(math_path.read_text(encoding='utf-8'))
by_id = {u['id']: u for u in data['units']}

# Tag existing items that match worksheet stems as 靜心電學; keep others as 自編
# Known worksheet-matching: 1/2+1/3, many basics - mark adapted ones we add; for old ones set 自編 unless clearly from sheet
for u in data['units']:
    for e in u.get('examples') or []:
        if 'source' not in e:
            e.update(self_src())
    for p in u.get('practice') or []:
        if 'source' not in p:
            p.update(self_src())

# ===== FRAC expand =====
frac = by_id['frac']
frac['examples'].extend([
    ex('例4', '分數加減混合',
       r'\dfrac{5}{6}-4+\dfrac{3}{2}-\dfrac{1}{2}',
       [step('先把整數改成分數', '4 寫成 $\\dfrac{4}{1}$，並通分到分母 6：',
             [r'4=\dfrac{24}{6}', r'\dfrac{3}{2}=\dfrac{9}{6}', r'\dfrac{1}{2}=\dfrac{3}{6}']),
        step('依序加減', '分子依符號加減：',
             [r'\dfrac{5}{6}-\dfrac{24}{6}+\dfrac{9}{6}-\dfrac{3}{6}=\dfrac{5-24+9-3}{6}=\dfrac{-13}{6}'])],
       r'-\dfrac{13}{6}', intro='這是習題改編的分數加減混合題：'),
    ex('例5', '並聯三電阻分數',
       r'\dfrac{1}{R}=\dfrac{1}{3}+\dfrac{1}{3}+\dfrac{1}{3}',
       [step('同分母相加', '三個同分母分數直接加分子：',
             [r'\dfrac{1}{3}+\dfrac{1}{3}+\dfrac{1}{3}=\dfrac{3}{3}=1']),
        step('求 $R$', '由 $\\dfrac{1}{R}=1$ 得：', [r'R=1'])],
       r'R=1', givenLabel='給定：', intro='電學並聯常用分數加法：'),
])
frac['practice'].extend([
    pr(r'$\dfrac{1}{2}\times\dfrac{1}{3}=$？',
       [r'A. $\dfrac{1}{6}$', r'B. $\dfrac{2}{5}$', r'C. $\dfrac{1}{5}$', r'D. $\dfrac{2}{6}$'],
       'A', '步驟一：分子分母相乘 $\\dfrac{1\\times 1}{2\\times 3}=\\dfrac{1}{6}$。\n最終答案：$\\dfrac{1}{6}$。'),
    pr(r'$\dfrac{5}{6}\times\dfrac{3}{4}\times\dfrac{2}{3}\times\dfrac{1}{2}=$？',
       [r'A. $\dfrac{5}{24}$', r'B. $\dfrac{5}{12}$', r'C. $\dfrac{15}{48}$', r'D. $\dfrac{1}{4}$'],
       'A', '步驟一：分子 $5\\times 3\\times 2\\times 1=30$，分母 $6\\times 4\\times 3\\times 2=144$。\n步驟二：$\\dfrac{30}{144}=\\dfrac{5}{24}$。\n最終答案：$\\dfrac{5}{24}$。'),
    pr(r'$\dfrac{1}{2}\\div 2=$？',
       [r'A. $\dfrac{1}{4}$', r'B. $1$', r'C. $\dfrac{1}{2}$', r'D. $4$'],
       'A', '步驟一：除以 2 等於乘 $\\dfrac{1}{2}$：$\\dfrac{1}{2}\\times\\dfrac{1}{2}=\\dfrac{1}{4}$。\n最終答案：$\\dfrac{1}{4}$。'),
    pr(r'三電阻並聯 $\dfrac{1}{R}=\dfrac{1}{2}+\dfrac{1}{3}+\dfrac{1}{6}$，$R=$？',
       [r'A. $1$', r'B. $2$', r'C. $3$', r'D. $6$'],
       'A', '步驟一：通分到 6：$\\dfrac{3}{6}+\\dfrac{2}{6}+\\dfrac{1}{6}=\\dfrac{6}{6}=1$。\n步驟二：$R=1$。\n最終答案：$R=1$。'),
    pr(r'$\dfrac{1}{2}\\times 2=$？',
       [r'A. $1$', r'B. $\dfrac{1}{4}$', r'C. $4$', r'D. $\dfrac{1}{2}$'],
       'A', '步驟一：$\\dfrac{1}{2}\\times\\dfrac{2}{1}=\\dfrac{2}{2}=1$。\n最終答案：$1$。'),
])

# ===== LINEAR1 =====
l1 = by_id['linear1']
l1['examples'].extend([
    ex('例4', '一元一次方程式',
       r'X+3=5',
       [step('常數移項', '兩邊同時減 3：', [r'X=5-3', r'X=2'])],
       r'X=2', givenLabel='給定方程式：'),
    ex('例5', '歐姆定律求電流',
       r'V=IR,\quad V=12,\quad R=4,\quad \text{求 }I',
       [step('寫出公式', '歐姆定律 $I=\\dfrac{V}{R}$：', [r'I=\dfrac{12}{4}']),
        step('計算', '相除得：', [r'I=3'])],
       r'I=3', givenLabel='已知：', intro='電路未知電流常化成一元一次：'),
    ex('例6', '含括號一元一次',
       r'2[(X+2)+3]=20',
       [step('先算括號內', '內層 $X+2+3=X+5$：', [r'2(X+5)=20']),
        step('兩邊同除 2', '', [r'X+5=10']),
        step('移項', '兩邊減 5：', [r'X=5'])],
       r'X=5', givenLabel='給定方程式：'),
])
l1['practice'].extend([
    pr(r'$2X+8=20$，$X=$？',
       [r'A. $6$', r'B. $4$', r'C. $14$', r'D. $28$'],
       'A', '步驟一：兩邊減 8 得 $2X=12$。\n步驟二：兩邊除以 2 得 $X=6$。\n最終答案：$X=6$。'),
    pr(r'$X-0.5=3$，$X=$？',
       [r'A. $3.5$', r'B. $2.5$', r'C. $3$', r'D. $0.5$'],
       'A', '步驟一：兩邊加 $0.5$。\n步驟二：$X=3.5$。\n最終答案：$3.5$。'),
    pr(r'$\dfrac{X}{2}+\dfrac{1}{2}=1$，$X=$？',
       [r'A. $1$', r'B. $2$', r'C. $\dfrac{1}{2}$', r'D. $0$'],
       'A', '步驟一：兩邊減 $\\dfrac{1}{2}$ 得 $\\dfrac{X}{2}=\\dfrac{1}{2}$。\n步驟二：兩邊乘 2 得 $X=1$。\n最終答案：$X=1$。'),
    pr(r'$2X+6=X+8$，$X=$？',
       [r'A. $2$', r'B. $1$', r'C. $14$', r'D. $6$'],
       'A', '步驟一：兩邊減 $X$ 得 $X+6=8$。\n步驟二：兩邊減 6 得 $X=2$。\n最終答案：$X=2$。'),
    pr(r'$V=IR$，$V=24\\,\\mathrm{V}$，$R=8\\,\\Omega$，$I=$？',
       [r'A. $3\\,\\mathrm{A}$', r'B. $192\\,\\mathrm{A}$', r'C. $0.33\\,\\mathrm{A}$', r'D. $16\\,\\mathrm{A}$'],
       'A', '步驟一：$I=\\dfrac{V}{R}=\\dfrac{24}{8}$。\n步驟二：$I=3\\,\\mathrm{A}$。\n最終答案：$3\\,\\mathrm{A}$。', from_src=False),
    pr(r'$6X+5-4X+3+2X-1=8$，$X=$？',
       [r'A. $\dfrac{1}{4}$', r'B. $1$', r'C. $0$', r'D. $4$'],
       'A', '步驟一：合併同類項 $(6-4+2)X+(5+3-1)=8X+7=8$… 實際 $6X-4X+2X=4X$，$5+3-1=7$，得 $4X+7=8$。\n步驟二：$4X=1$，$X=\\dfrac{1}{4}$。\n最終答案：$X=\\dfrac{1}{4}$。'),
])

# ===== LINEAR2 =====
l2 = by_id['linear2']
l2['examples'].extend([
    ex('例3', '加減消去法',
       r'\begin{cases} A+B=2 \\ A-B=0 \end{cases}',
       [step('兩式相加', '消去 $B$：', [r'2A=2', r'A=1']),
        step('代回', '由 $A+B=2$：', [r'1+B=2', r'B=1'])],
       r'A=1,\\; B=1', givenLabel='給定聯立方程式：'),
    ex('例4', '代入法',
       r'\begin{cases} X+Y=4 \\ 2X+Y=2 \end{cases}',
       [step('兩式相減', '消 $Y$：', [r'(2X+Y)-(X+Y)=2-4', r'X=-2']),
        step('代回求 $Y$', '', [r'-2+Y=4', r'Y=6'])],
       r'X=-2,\\; Y=6', givenLabel='給定聯立方程式：'),
    ex('例5', '兩電壓聯立（電學）',
       r'\begin{cases} \dfrac{V_1}{1}+\dfrac{V_2}{2}=6 \\ 2V_1+V_2=12 \end{cases}',
       [step('化簡第一式', '通分：$2V_1+V_2=12$', [r'2V_1+V_2=12']),
        step('與第二式比較', '兩式相同，為相依方程組，解不唯一；若再給條件才有唯一解。此處取與第二式一致的一組特解：令 $V_1=3$', [r'2(3)+V_2=12', r'V_2=6'])],
       r'V_1=3,\\; V_2=6\\;(\\text{特解})', givenLabel='給定：', stretch=True),
])
l2['practice'].extend([
    pr(r'$A+B=2$，$A-B=0$，$A=$？',
       [r'A. $1$', r'B. $0$', r'C. $2$', r'D. $-1$'],
       'A', '步驟一：兩式相加 $2A=2$。\n步驟二：$A=1$。\n最終答案：$A=1$。'),
    pr(r'$X+Y=4$，$2X+Y=2$，$Y=$？',
       [r'A. $6$', r'B. $2$', r'C. $0$', r'D. $4$'],
       'A', '步驟一：相減得 $X=-2$。\n步驟二：$-2+Y=4$，$Y=6$。\n最終答案：$Y=6$。'),
    pr(r'$A+B=-5$，$A-B=-5$，$A=$？',
       [r'A. $-5$', r'B. $0$', r'C. $5$', r'D. $-10$'],
       'A', '步驟一：兩式相加 $2A=-10$。\n步驟二：$A=-5$。\n最終答案：$A=-5$。'),
    pr(r'$2X+3Y=8$，$3X+2Y=7$，$X=$？',
       [r'A. $1$', r'B. $2$', r'C. $3$', r'D. $0$'],
       'A', '步驟一：第一式×2、第二式×3：$4X+6Y=16$，$9X+6Y=21$。\n步驟二：相減 $5X=5$，$X=1$。\n最終答案：$X=1$。'),
    pr(r'兩迴路 $I_1+I_2=5$，$I_1-I_2=1$，則 $I_1=$？',
       [r'A. $3$', r'B. $2$', r'C. $4$', r'D. $1$'],
       'A', '步驟一：相加 $2I_1=6$。\n步驟二：$I_1=3$。\n最終答案：$3$。', from_src=False),
])

# ===== SIGNED =====
sg = by_id['signed']
sg['examples'].extend([
    ex('例4', '絕對值',
       r'|3-2|\quad\text{與}\quad |2-3|',
       [step('先算括號內', '', [r'3-2=1', r'2-3=-1']),
        step('取絕對值', '絕對值為非負：', [r'|1|=1', r'|-1|=1'])],
       r'|3-2|=1,\\quad |2-3|=1'),
    ex('例5', '絕對值方程式',
       r'|X-3|=2',
       [step('拆成兩式', '絕對值等於正數時有兩解：', [r'X-3=2\\quad\\text{或}\\quad X-3=-2']),
        step('求解', '', [r'X=5\\quad\\text{或}\\quad X=1'])],
       r'X=5\\;\\text{或}\\; X=1'),
])
sg['practice'].extend([
    pr(r'$|-13-2|=$？',
       [r'A. $15$', r'B. $-15$', r'C. $11$', r'D. $13$'],
       'A', '步驟一：$-13-2=-15$。\n步驟二：$|-15|=15$。\n最終答案：$15$。'),
    pr(r'$|2-(-13)|=$？',
       [r'A. $15$', r'B. $-15$', r'C. $11$', r'D. $-11$'],
       'A', '步驟一：$2-(-13)=2+13=15$。\n步驟二：$|15|=15$。\n最終答案：$15$。'),
    pr(r'$|X-8|=5$，較大的解 $X=$？',
       [r'A. $13$', r'B. $3$', r'C. $8$', r'D. $5$'],
       'A', '步驟一：$X-8=5$ 或 $X-8=-5$。\n步驟二：$X=13$ 或 $X=3$，較大為 13。\n最終答案：$13$。'),
    pr(r'$-2\\times 3+(-3-(-1))=$？',
       [r'A. $-8$', r'B. $-4$', r'C. $4$', r'D. $8$'],
       'A', '步驟一：括號 $-3-(-1)=-3+1=-2$。\n步驟二：$-2\\times 3=-6$，再 $-6+(-2)=-8$。\n最終答案：$-8$。'),
    pr(r'電位差 $V_{AB}=V_A-V_B$，$V_A=3$，$V_B=7$，$V_{AB}=$？',
       [r'A. $-4$', r'B. $4$', r'C. $10$', r'D. $-10$'],
       'A', '步驟一：$V_{AB}=3-7=-4$。\n最終答案：$-4$。', from_src=False),
])

# ===== POWER-ROOT =====
pru = by_id['power-root']
pru['examples'].extend([
    ex('例4', '平方根基本',
       r'\sqrt{16},\;\sqrt{81},\;\sqrt{100}',
       [step('對照平方數', '', [r'4^2=16', r'9^2=81', r'10^2=100']),
        step('寫出根號值', '', [r'\sqrt{16}=4', r'\sqrt{81}=9', r'\sqrt{100}=10'])],
       r'4,\;9,\;10'),
    ex('例5', '功率 $I^{2}R$',
       r'P=I^{2}R,\quad I=2,\; R=5',
       [step('先算 $I^{2}$', '', [r'I^{2}=2^{2}=4']),
        step('乘上 $R$', '', [r'P=4\\times 5=20'])],
       r'P=20', givenLabel='已知：', intro='電學功率公式常用次方：', from_src=False),
    ex('例6', '科學記號次方相乘',
       r'10^{2}\\times 10^{3}\\times 10^{4}',
       [step('同底數相乘，指數相加', '', [r'10^{2+3+4}=10^{9}'])],
       r'10^{9}'),
])
pru['practice'].extend([
    pr(r'$\sqrt{16}=$？',
       [r'A. $4$', r'B. $8$', r'C. $32$', r'D. $256$'],
       'A', '步驟一：$4^{2}=16$。\n最終答案：$4$。'),
    pr(r'$\sqrt{2}+\\sqrt{3}+\\sqrt{4}$ 中，$\\sqrt{4}=$？',
       [r'A. $2$', r'B. $4$', r'C. $\\sqrt{2}$', r'D. $1$'],
       'A', '步驟一：$\\sqrt{4}=2$（因 $2^{2}=4$）。\n最終答案：$2$。'),
    pr(r'$P=I^{2}R$，$I=3\\,\\mathrm{A}$，$R=4\\,\\Omega$，$P=$？',
       [r'A. $36\\,\\mathrm{W}$', r'B. $12\\,\\mathrm{W}$', r'C. $7\\,\\mathrm{W}$', r'D. $48\\,\\mathrm{W}$'],
       'A', '步驟一：$I^{2}=9$。\n步驟二：$P=9\\times 4=36\\,\\mathrm{W}$。\n最終答案：$36\\,\\mathrm{W}$。', from_src=False),
    pr(r'$10^{3}\\times 10^{5}\\times 10^{8}\\div (10^{2}\\times 10^{4})=$？',
       [r'A. $10^{10}$', r'B. $10^{8}$', r'C. $10^{12}$', r'D. $10^{6}$'],
       'A', '步驟一：分子指數 $3+5+8=16$，分母 $2+4=6$。\n步驟二：$10^{16-6}=10^{10}$。\n最終答案：$10^{10}$。'),
    pr(r'$\\sqrt{2}+3\\sqrt{2}+4\\sqrt{2}=$？',
       [r'A. $8\\sqrt{2}$', r'B. $9\\sqrt{2}$', r'C. $7\\sqrt{2}$', r'D. $24\\sqrt{2}$'],
       'A', '步驟一：同類項係數相加 $1+3+4=8$。\n最終答案：$8\\sqrt{2}$。'),
])

# ===== RATIO =====
rt = by_id['ratio']
rt['examples'].extend([
    ex('例3', '比例求未知',
       r'5:8=x:24',
       [step('交叉相乘', '', [r'5\\times 24=8x', r'120=8x']),
        step('解 $x$', '', [r'x=15'])],
       r'x=15', from_src=False),
    ex('例4', '效率百分率與比例',
       r'\\eta=80\\%=0.8,\\quad P_{in}=220\\times 4,\\quad P_{out}=\\eta P_{in}',
       [step('先算輸入功率', '', [r'P_{in}=880\\,\\mathrm{W}']),
        step('乘效率', '', [r'P_{out}=0.8\\times 880=704\\,\\mathrm{W}'])],
       r'P_{out}=704\\,\\mathrm{W}', givenLabel='已知：', intro='電動機效率常用比例／百分率：', from_src=False),
    ex('例5', '分流比',
       r'兩並聯支路電阻比 R_1:R_2=1:2，電流比？',
       [step('並聯時電流與電阻成反比', '', [r'I_1:I_2=R_2:R_1=2:1'])],
       r'I_1:I_2=2:1', givenLabel='已知：', from_src=False),
])
rt['practice'].extend([
    pr(r'$2:7=x:21$，$x=$？',
       [r'A. $6$', r'B. $7$', r'C. $14$', r'D. $3$'],
       'A', '步驟一：$2\\times 21=7x$。\n步驟二：$x=6$。\n最終答案：$6$。', from_src=False),
    pr(r'效率 $80\\%$，輸入 $1000\\,\\mathrm{W}$，輸出約？',
       [r'A. $800\\,\\mathrm{W}$', r'B. $80\\,\\mathrm{W}$', r'C. $1250\\,\\mathrm{W}$', r'D. $100\\,\\mathrm{W}$'],
       'A', '步驟一：$0.8\\times 1000=800$。\n最終答案：$800\\,\\mathrm{W}$。', from_src=False),
    pr(r'分壓 $R_1:R_2=1:4$，總壓 $20\\,\\mathrm{V}$，$R_1$ 分得？',
       [r'A. $4\\,\\mathrm{V}$', r'B. $16\\,\\mathrm{V}$', r'C. $5\\,\\mathrm{V}$', r'D. $10\\,\\mathrm{V}$'],
       'A', '步驟一：總份 $1+4=5$。\n步驟二：$20\\times\\dfrac{1}{5}=4\\,\\mathrm{V}$。\n最終答案：$4\\,\\mathrm{V}$。', from_src=False),
    pr(r'匝比 $N_p:N_s=5:1$，$V_p=110\\,\\mathrm{V}$，$V_s\\approx$？',
       [r'A. $22\\,\\mathrm{V}$', r'B. $550\\,\\mathrm{V}$', r'C. $110\\,\\mathrm{V}$', r'D. $11\\,\\mathrm{V}$'],
       'A', '步驟一：$\\dfrac{V_s}{V_p}=\\dfrac{N_s}{N_p}=\\dfrac{1}{5}$。\n步驟二：$V_s=22\\,\\mathrm{V}$。\n最終答案：$22\\,\\mathrm{V}$。', from_src=False),
])

# ===== UNITS =====
un = by_id['units']
un['examples'].extend([
    ex('例4', '科學記號加減',
       r'1.2\\times 10^{3}+3.4\\times 10^{4}',
       [step('對齊指數', '都寫成 $10^{3}$：', [r'3.4\\times 10^{4}=34\\times 10^{3}']),
        step('相加', '', [r'(1.2+34)\\times 10^{3}=35.2\\times 10^{3}=3.52\\times 10^{4}'])],
       r'3.52\\times 10^{4}'),
    ex('例5', 'k／m 混合換算',
       r'2\\,\\mathrm{k}\\Omega\\text{ 通過 }5\\,\\mathrm{mA}\\text{，壓降？}',
       [step('換成基本單位', '', [r'R=2000\\,\\Omega', r'I=0.005\\,\\mathrm{A}']),
        step('歐姆定律', '', [r'V=IR=2000\\times 0.005=10\\,\\mathrm{V}'])],
       r'V=10\\,\\mathrm{V}', givenLabel='已知：', from_src=False),
])
un['practice'].extend([
    pr(r'$0.25\\times 10=$？',
       [r'A. $2.5$', r'B. $0.025$', r'C. $25$', r'D. $0.25$'],
       'A', '步驟一：小數點右移一位得 $2.5$。\n最終答案：$2.5$。'),
    pr(r'$326\\div 100=$？',
       [r'A. $3.26$', r'B. $32.6$', r'C. $32600$', r'D. $0.326$'],
       'A', '步驟一：除以 100，小數點左移兩位。\n最終答案：$3.26$。'),
    pr(r'$1.234\\times 1000=$？',
       [r'A. $1234$', r'B. $1.234$', r'C. $12.34$', r'D. $0.001234$'],
       'A', '步驟一：乘 1000，小數點右移三位。\n最終答案：$1234$。'),
    pr(r'$5.6\\times 10^{6}-2.3\\times 10^{3}\\approx$？（數量級）',
       [r'A. 約 $5.6\\times 10^{6}$', r'B. 約 $3.3\\times 10^{6}$', r'C. 約 $2.3\\times 10^{3}$', r'D. $0$'],
       'A', '步驟一：$2.3\\times 10^{3}$ 遠小於 $5.6\\times 10^{6}$，相減後幾乎仍是 $5.5977\\times 10^{6}$。\n最終答案：約 $5.6\\times 10^{6}$。'),
    pr(r'$47\\,\\mathrm{nF}=$？$\\mathrm{F}$',
       [r'A. $4.7\\times 10^{-8}$', r'B. $47\\times 10^{-6}$', r'C. $47\\times 10^{-3}$', r'D. $4.7\\times 10^{-6}$'],
       'A', '步驟一：$\\mathrm{n}=10^{-9}$。\n步驟二：$47\\times 10^{-9}=4.7\\times 10^{-8}$。\n最終答案：$4.7\\times 10^{-8}\\,\\mathrm{F}$。', from_src=False),
])

# ===== NEW: arith =====
arith = {
    'id': 'arith',
    'name': '四則與括號',
    'blurb': '先乘除後加減；小括號→中括號→大括號。電學代入公式前先算對括號。',
    'explain': '運算順序：括號內優先，再乘除，最後加減。同層由左而右。',
    'examples': [
        ex('例1', '四則混合',
           r'2\\times 3+4\\times 5',
           [step('先做兩組乘法', '', [r'2\\times 3=6', r'4\\times 5=20']),
            step('再相加', '', [r'6+20=26'])],
           r'26'),
        ex('例2', '含括號',
           r'3(2\\times 3+6\\times 3)',
           [step('括號內先乘', '', [r'2\\times 3=6', r'6\\times 3=18']),
            step('括號內相加再乘外層', '', [r'6+18=24', r'3\\times 24=72'])],
           r'72'),
        ex('例3', '嵌套括號',
           r'5+[5+(5\\div 5-1)]',
           [step('最內層', '', [r'5\\div 5-1=1-1=0']),
            step('中層', '', [r'5+0=5']),
            step('外層', '', [r'5+5=10'])],
           r'10'),
        ex('例4', '中括號乘法',
           r'3[(1\\times 2+3)+(4\\times 5\\div 2)]',
           [step('兩小括號', '', [r'1\\times 2+3=5', r'4\\times 5\\div 2=10']),
            step('相加再乘 3', '', [r'5+10=15', r'3\\times 15=45'])],
           r'45'),
        ex('例5', '較深括號',
           r'4\\{2[(3+1\\times 2)\\div 5]+6\\times 5\\}',
           [step('最內：$3+2=5$，再 $\\div 5$', '', [r'(3+2)\\div 5=1']),
            step('中層', '', [r'2\\times 1+30=32']),
            step('外層乘 4', '', [r'4\\times 32=128'])],
           r'128'),
    ],
    'practice': [
        pr(r'$8\\times 7-6\\times 5+3\\times 2-10\\div 2=$？',
           [r'A. $32$', r'B. $22$', r'C. $42$', r'D. $12$'],
           'A', '步驟一：$56-30+6-5$。\n步驟二：$26+6-5=27$… 重算：$56-30=26$，$26+6=32$，$32-5=27$。選項核對：$8\\times7=56$，$6\\times5=30$，$3\\times2=6$，$10\\div2=5$；$56-30+6-5=27$。若無 27 則最接近邏輯為仔細演算。改正確答案：27 不在選項——改題。\n最終答案：見更正版。'),  # will fix
    ],
}

# Fix arith practice with correct items
arith['practice'] = [
    pr(r'$2\\times 3+4\\times 5=$？',
       [r'A. $26$', r'B. $50$', r'C. $14$', r'D. $22$'],
       'A', '步驟一：$6+20=26$。\n最終答案：$26$。'),
    pr(r'$3(2\\times 3+6\\times 3)=$？',
       [r'A. $72$', r'B. $36$', r'C. $54$', r'D. $24$'],
       'A', '步驟一：括號內 $6+18=24$。\n步驟二：$3\\times 24=72$。\n最終答案：$72$。'),
    pr(r'$5+[5+(5\\div 5-1)]=$？',
       [r'A. $10$', r'B. $5$', r'C. $11$', r'D. $9$'],
       'A', '步驟一：內層 $1-1=0$。\n步驟二：$5+[5+0]=10$。\n最終答案：$10$。'),
    pr(r'$3[(1\\times 2+3)+(4\\times 5\\div 2)]=$？',
       [r'A. $45$', r'B. $30$', r'C. $15$', r'D. $60$'],
       'A', '步驟一：$5+10=15$。\n步驟二：$3\\times 15=45$。\n最終答案：$45$。'),
    pr(r'$4\\{2[(3+1\\times 2)\\div 5]+6\\times 5\\}=$？',
       [r'A. $128$', r'B. $64$', r'C. $32$', r'D. $96$'],
       'A', '步驟一：內 $(3+2)\\div5=1$；中 $2\\times1+30=32$；外 $4\\times32=128$。\n最終答案：$128$。'),
    pr(r'$10(1\\times 3+2\\times 4+3\\times 5-4\\times 5)=$？',
       [r'A. $20$', r'B. $10$', r'C. $0$', r'D. $30$'],
       'A', '步驟一：括號 $3+8+15-20=6$。\n步驟二：$10\\times 6=60$… 重算 $3+8=11$，$11+15=26$，$26-20=6$，$10\\times6=60$。選項無 60——修正選項。'),
]
# fix last two with correct choices
arith['practice'][5] = pr(
    r'$10(1\\times 3+2\\times 4+3\\times 5-4\\times 5)=$？',
    [r'A. $60$', r'B. $10$', r'C. $0$', r'D. $30$'],
    'A', '步驟一：$3+8+15-20=6$。\n步驟二：$10\\times 6=60$。\n最終答案：$60$。')
arith['practice'].append(pr(
    r'$8\\times 7-6\\times 5+3\\times 2-10\\div 2=$？',
    [r'A. $27$', r'B. $32$', r'C. $22$', r'D. $37$'],
    'A', '步驟一：$56-30+6-5$。\n步驟二：$26+6-5=27$。\n最終答案：$27$。'))
arith['practice'].append(pr(
    r'先算哪一步？$2+3\\times 4$',
    [r'A. 先乘：$3\\times 4$', r'B. 先加：$2+3$', r'C. 隨便', r'D. 由右而左'],
    'A', '步驟一：先乘除後加減。\n步驟二：$2+12=14$。\n最終答案：先乘。', from_src=False))

# ===== NEW: percent =====
percent = {
    'id': 'percent',
    'name': '小數與百分率',
    'blurb': '效率、調整率、誤差常用 %；小數點移位與×10／÷10 是電學換算底子。',
    'explain': '百分率：$a\\%=\\dfrac{a}{100}$。小數化百分率：乘 100 再加 %。$\\times 10$ 小數點右移一位，$\\div 10$ 左移一位。',
    'examples': [
        ex('例1', '小數化百分率',
           r'0.56,\;0.05,\;1.21',
           [step('乘 100 加 %', '', [r'0.56=56\\%', r'0.05=5\\%', r'1.21=121\\%'])],
           r'56\\%,\;5\\%,\;121\\%'),
        ex('例2', '×10／÷10',
           r'5\\times 10,\;5\\div 10,\;0.25\\times 10,\;0.25\\div 10',
           [step('移位法則', '×10 右移一位，÷10 左移一位：',
                 [r'50', r'0.5', r'2.5', r'0.025'])],
           r'50,\;0.5,\;2.5,\;0.025'),
        ex('例3', '小數四則',
           r'1.2+2.3\\quad\\text{與}\\quad 1.2\\times 1.2',
           [step('加法對齊小數點', '', [r'1.2+2.3=3.5']),
            step('乘法', '', [r'1.2\\times 1.2=1.44'])],
           r'3.5,\;1.44'),
        ex('例4', '效率',
           r'\\eta=80\\%,\;P_{in}=880\\,\\mathrm{W}',
           [step('百分率改小數', '', [r'0.8\\times 880=704'])],
           r'P_{out}=704\\,\\mathrm{W}', givenLabel='已知：', from_src=False),
        ex('例5', '複合小數',
           r'[(0.1+3\\times 2)\\div 10+8]\\div 100',
           [step('括號內', '', [r'0.1+6=6.1', r'6.1\\div 10=0.61', r'0.61+8=8.61']),
            step('再 ÷100', '', [r'0.0861'])],
           r'0.0861'),
    ],
    'practice': [
        pr(r'$0.327=$？%',
           [r'A. $32.7\\%$', r'B. $3.27\\%$', r'C. $327\\%$', r'D. $0.327\\%$'],
           'A', '步驟一：乘 100。\n最終答案：$32.7\\%$。'),
        pr(r'$0.9=$？%',
           [r'A. $90\\%$', r'B. $9\\%$', r'C. $0.9\\%$', r'D. $900\\%$'],
           'A', '步驟一：$0.9\\times 100=90$。\n最終答案：$90\\%$。'),
        pr(r'$0.01=$？%',
           [r'A. $1\\%$', r'B. $10\\%$', r'C. $0.1\\%$', r'D. $100\\%$'],
           'A', '步驟一：$0.01\\times 100=1$。\n最終答案：$1\\%$。'),
        pr(r'$5.2\\times 10+5.2\\div 10=$？',
           [r'A. $52.52$', r'B. $5.252$', r'C. $57.2$', r'D. $52.052$'],
           'A', '步驟一：$52+0.52=52.52$。\n最終答案：$52.52$。'),
        pr(r'$1.1\\times 1.1+2.2\\times 2.2=$？',
           [r'A. $6.05$', r'B. $5.05$', r'C. $4.84$', r'D. $3.3$'],
           'A', '步驟一：$1.21+4.84=6.05$。\n最終答案：$6.05$。'),
        pr(r'效率 $75\\%$ 的輸出若為 $600\\,\\mathrm{W}$，輸入約？',
           [r'A. $800\\,\\mathrm{W}$', r'B. $450\\,\\mathrm{W}$', r'C. $600\\,\\mathrm{W}$', r'D. $75\\,\\mathrm{W}$'],
           'A', '步驟一：$P_{in}=P_{out}/\\eta=600/0.75=800$。\n最終答案：$800\\,\\mathrm{W}$。', from_src=False),
        pr(r'$4(0.1+0.2\\times 3)=$？',
           [r'A. $2.8$', r'B. $1.2$', r'C. $3.6$', r'D. $0.7$'],
           'A', '步驟一：$0.2\\times 3=0.6$，$0.1+0.6=0.7$。\n步驟二：$4\\times 0.7=2.8$。\n最終答案：$2.8$。'),
        pr(r'速率調整率 $\\dfrac{n_0-n}{n}\\times 100\\%$，$n_0=1800$，$n=1739$，約？',
           [r'A. $3.5\\%$', r'B. $35\\%$', r'C. $0.35\\%$', r'D. $61\\%$'],
           'A', '步驟一：$1800-1739=61$。\n步驟二：$61/1739\\approx 0.035\\approx 3.5\\%$。\n最終答案：約 $3.5\\%$。', from_src=False),
    ],
}

# Insert new units at front of list (after rebuilding order)
# Keep order: arith, percent, frac, linear1, linear2, signed, power-root, ratio, units
ordered = [arith, percent]
for uid in ['frac', 'linear1', 'linear2', 'signed', 'power-root', 'ratio', 'units']:
    ordered.append(by_id[uid])
data['units'] = ordered
data['meta'] = {
    'difficultyNote': '難度上限：高中／高職統測電機電子群。高職統測內靜電習題數學盡量放入；超綱電磁理論不進數學核心。',
    'sourcePolicy': '改編自靜心電學教室者標 source；自編標「自編」。',
}

math_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

# ---------- TIPS ----------
tips = {
    'sourceNote': '整理自靜心電學教室公開備考文，僅摘要改寫，非原文照錄。行銷／LINE／報價已略。',
    'categories': [
        {
            'id': 'method',
            'name': '讀書方法',
            'tips': [
                {'title': '先養成每天 30 分鐘', 'body': '一開始難專心是正常的。先固定每天靜坐讀書 30 分鐘；能穩定後再一週加一點時間，目標是能連續專注兩小時以上。', 'tags': ['習慣'], **src(NOTE_SUM)},
                {'title': '三輪學習：略讀→詳讀→精讀', 'body': '第一輪只求每章大方向與基本題；第二輪補洞到多數題會做；第三輪用整本／考古題練到反射。不要第一輪就想全會。', 'tags': ['三輪'], **src(NOTE_SUM)},
                {'title': '隔天先快速複習昨天', 'body': '略讀時，隔天打開書先花短時間把昨天內容過一遍，再往下讀，吸收會穩很多。', 'tags': ['複習'], **src(NOTE_SUM)},
                {'title': '先觀念，再變化題', 'body': '題目都是觀念的變化。前半段寧可把大方向記清楚，也不要死背單一題步驟。', 'tags': ['觀念'], **src(NOTE_SUM)},
                {'title': '單章過關再進整本', 'body': '每一章小測驗大概穩了，再進入跨章大範圍。章節還沒走完就狂刷整本，效益較差。', 'tags': ['進度'], **src(NOTE_SUM)},
                {'title': '讀書時手機隔離', 'body': '分心常見原因是干擾與習慣。讀書時段把手機移出視線，比「意志力硬撐」有效。', 'tags': ['專注'], **src(NOTE_SUM)},
                {'title': '下班很累就縮時間、保節奏', 'body': '有工作家庭仍要讀書時，寧可每天短時間固定執行，也不要一次讀爆然後斷好幾天。', 'tags': ['在職'], **src(NOTE_SUM)},
                {'title': '把問題丟給潛意識', 'body': '卡住的題看完解答仍似懂非懂時，帶著問題休息或散步，常會突然通。前提是白天有認真想過。', 'tags': ['思考'], **src(NOTE_SUM)},
            ],
        },
        {
            'id': 'practice',
            'name': '練習與大範圍',
            'tips': [
                {'title': '小範圍易、大範圍難是正常', 'body': '單章公式好套；整本亂序出題時，難在「這題屬於哪一章、用哪條式」。要靠大量跨章練習練直覺。', 'tags': ['大範圍'], **src(NOTE_SUM)},
                {'title': '看到題先問三件事', 'body': '答題前默問：(1)哪一章？(2)考哪個觀念？(3)確定後再小心計算。練約數十回後會變反射。', 'tags': ['答題'], **src(NOTE_SUM)},
                {'title': '大範圍紀錄錯題與猜對', 'body': '每回練習記下錯題號；猜對的也要標，因為那是「當下不會」的點，複習優先。', 'tags': ['錯題'], **src(NOTE_SUM)},
                {'title': '一天 1～2 回就好', 'body': '總複習階段不求一次寫爆。穩定每天一回整份，連續數週，分數通常會慢慢上來。', 'tags': ['節奏'], **src(NOTE_SUM)},
                {'title': '選擇題當填充練', 'body': '練習時可先蓋住選項，當計算／填充來寫，再對答案，比較能暴露真實力。', 'tags': ['練法'], **src(NOTE_SUM)},
                {'title': '考古來源要多元', 'body': '統測、初考、鐵佐等題型都可練跨章感。難度與風格不同，有助辨認弱章。', 'tags': ['考古'], **src(NOTE_SUM)},
                {'title': '先易後難排練習卷', 'body': '剛進大範圍可先從較基本的考卷上手，熟悉「整本亂序」的感覺，再挑戰較難份。', 'tags': ['順序'], **src(NOTE_SUM)},
                {'title': '弱章要回到單章補', 'body': '若整回分數卡住不上，多半是某幾章仍不熟，應回單章重練，而不是只重複整本。', 'tags': ['弱點'], **src(NOTE_SUM)},
            ],
        },
        {
            'id': 'exam',
            'name': '答卷與考前',
            'tips': [
                {'title': '詳讀當次考試規定', 'body': '臨時規則（例如簽名欄）可能影響分數。發卷先掃說明與注意事項再動筆。', 'tags': ['規定'], **src(NOTE_SUM)},
                {'title': '答案排版讓人好改', 'body': '計算過程與最終答案位置清楚，閱卷速度快、漏看少。平時小考就練習「白紙作答排版」。', 'tags': ['作答'], **src(NOTE_SUM)},
                {'title': '考前一週複習錯題本', 'body': '大範圍練完後，考前把標記過的錯題／猜對題再弄懂一輪，比再刷全新卷更划算。', 'tags': ['考前'], **src(NOTE_SUM)},
                {'title': '考前作息先調回來', 'body': '最後幾天把睡覺與用餐時間調成接近考試日，避免只在深夜才有精神。', 'tags': ['作息'], **src(NOTE_SUM)},
                {'title': '焦慮時回到「下一小步」', 'body': '大範圍初期成績难看是常見的。把目標縮成「今天這一回的錯因」，比空想上榜有用。', 'tags': ['焦慮'], **src(NOTE_SUM)},
                {'title': '考前過目勝於開新坑', 'body': '最後階段以複習筆記、公式卡、錯題為主，少開全新超綱章節。', 'tags': ['衝刺'], **src(NOTE_SUM)},
            ],
        },
        {
            'id': 'mathbase',
            'name': '數學基礎',
            'tips': [
                {'title': '數學底子決定計算題上限', 'body': '電學計算題大量用到分數、一元一次、單位字首與根號。底子不穩時，後面章節會一直卡在算式。', 'tags': ['基礎'], **src(NOTE_SUM)},
                {'title': '不會就先補國中職數學', 'body': '若連四則括號、分數、解 $x$ 都不順，先把數學基礎單元練熟，再衝專業章，整體更快。', 'tags': ['順序'], **src(NOTE_SUM)},
                {'title': '單位字首當成必背', 'body': 'k／m／μ／M 沒換成基本單位就代入，是最常見的無謂失分。養成「先換單位再算」。', 'tags': ['單位'], **src(NOTE_SUM)},
                {'title': '並聯電阻就是分數加法', 'body': '$\\dfrac{1}{R}=\\dfrac{1}{R_1}+\\dfrac{1}{R_2}$ 本質是通分。分數練熟，並聯題速度會上去。', 'tags': ['分數'], **src(NOTE_SUM)},
                {'title': '歐姆定律當一元一次練', 'body': '已知其二求其一，就是解一元一次方程式。移項習慣好，電路未知數就不怕。', 'tags': ['方程式'], **src(NOTE_SUM)},
                {'title': '次方與根號服務功率／有效值', 'body': '$I^{2}R$、$\\sqrt{2}$ 有效值都是高職範圍內必用。不必碰大學微積分也能把這層算穩。', 'tags': ['次方'], **src(NOTE_SUM)},
                {'title': '超綱電磁理論先放一邊', 'body': '庫侖定律微積分形式、場論推導等屬大學內容，備考高職／僱員時優先保證計算底子與課本公式。', 'tags': ['範圍'], **src(NOTE_SUM)},
            ],
        },
        {
            'id': 'mindset',
            'name': '心態',
            'tips': [
                {'title': '從不懂到跑完三輪很花時間', 'body': '基礎弱時，完整跑完多輪學習常要幾百小時級投入。難，但可拆成每天可完成的小塊。', 'tags': ['耐心'], **src(NOTE_SUM)},
                {'title': '照做仍不會：多半欠火候', 'body': '方法對了仍寫不出，常見是練習量與內化不夠，不是「人不行」。回到題目與錯因，不要只重看影片。', 'tags': ['內化'], **src(NOTE_SUM)},
                {'title': '知識記住≠身體會解', 'body': '聽懂解答和考試臨場寫出是兩件事。要把步驟練到不用想「下一行寫什麼」。', 'tags': ['熟練'], **src(NOTE_SUM)},
                {'title': '進步靠反覆，不靠一次頓悟', 'body': '大範圍像「劈岩石」：第一次嚇到是正常，靠不放棄的回數堆出來。', 'tags': ['毅力'], **src(NOTE_SUM)},
                {'title': '貴人提點在自己練夠後才聽得懂', 'body': '同樣一句提醒，練習量夠了才聽得進背後意思。先自己寫、再問、再改。', 'tags': ['提問'], **src(NOTE_SUM)},
                {'title': '目標要具體到下次考試', 'body': '「好好讀書」太模糊。改成「本週完成某章三回測驗」或「每天一大範圍回」較能執行。', 'tags': ['目標'], **src(NOTE_SUM)},
                {'title': '投資自己最划算', 'body': '半年一年的專注，換長期穩定工作，是很高報酬的投入；把時間排進日曆，而不是只放在想像裡。', 'tags': ['動機'], **src(NOTE_SUM)},
            ],
        },
    ],
}

tips_dir = ROOT / 'data/tips'
tips_dir.mkdir(parents=True, exist_ok=True)
(tips_dir / 'tips.json').write_text(json.dumps(tips, ensure_ascii=False, indent=2), encoding='utf-8')

def write_js(path, var, obj):
    path.write_text(f'window.{var} = {json.dumps(obj, ensure_ascii=False)};\n', encoding='utf-8')

write_js(ROOT / 'data/math/lessons-data.js', '__MATH_LESSONS__', data)
write_js(tips_dir / 'tips-data.js', '__TIPS__', tips)

# summary
print('UNITS', [(u['id'], len(u['examples']), len(u['practice'])) for u in data['units']])
print('TIPS cats', [(c['id'], len(c['tips'])) for c in tips['categories']], 'total', sum(len(c['tips']) for c in tips['categories']))
