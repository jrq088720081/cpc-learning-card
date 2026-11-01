#!/usr/bin/env python3
"""Build data/en-vocab.json from the English past-exam bank.

Collects content words (stems, options, passages, glossed 單字) and glossed
片語, drops function words and proper names, lemmatizes inflection, and
attaches KK, syllable splits, part of speech, a short Traditional-Chinese
gloss, and a morphology split only when the parts are real.

Regenerate after editing data/en/quiz.json:

    python3 scripts/build_en_vocab.py

Dictionary caches (not committed) live in scripts/.cache/:
  cmudict.dict, mhyph.txt, ecdict.csv
Manual corrections in scripts/en_vocab_overrides.json win over heuristics.
"""
from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUIZ = ROOT / 'data' / 'en' / 'quiz.json'
CACHE = ROOT / 'scripts' / '.cache'
OVR_PATH = ROOT / 'scripts' / 'en_vocab_overrides.json'
OUT_JSON = ROOT / 'data' / 'en-vocab.json'
OUT_JS = ROOT / 'data' / 'en-vocab-data.js'

TOKEN_RE = re.compile(r"[A-Za-z]+(?:['’-][A-Za-z]+)*")
WORD_RE = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)?")

# Always drop. These are the closed-class items the bank should not teach as 單字.
HARD_FUNCTION = {
    'a', 'an', 'the',
    'i', 'me', 'my', 'mine', 'myself',
    'you', 'your', 'yours', 'yourself', 'yourselves',
    'he', 'him', 'his', 'himself',
    'she', 'her', 'hers', 'herself',
    'it', 'its', 'itself',
    'we', 'us', 'our', 'ours', 'ourselves',
    'they', 'them', 'their', 'theirs', 'themselves',
    'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'do', 'does', 'did', 'doing', 'done',
    'have', 'has', 'had', 'having',
    'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
    'and', 'or', 'but', 'nor', 'not', 'no',
    'of', 'to', 'in', 'on', 'at', 'for', 'from', 'by', 'with', 'as', 'into', 'onto',
    'this', 'that', 'these', 'those',
    'who', 'whom', 'whose', 'which', 'what',
    'there', 'here', 'than', 'then',
    'because', 'through', 'other', 'others', 'another',
}
# Closed-class words worth keeping when they actually show up in the bank.
TEACH_FUNCTION = {
    'yet', 'however', 'although', 'despite', 'during', 'between', 'without',
    'whether', 'until', 'since', 'once', 'already', 'often', 'usually',
    'sometimes', 'always', 'never', 'enough', 'several', 'within', 'among',
}
# Drop unless the exam glosses them on purpose (yet＝尚未, etc.).
SOFT_FUNCTION = {
    'about', 'above', 'across', 'after', 'again', 'against', 'ago', 'all', 'almost',
    'along', 'already', 'also', 'although', 'always', 'among', 'amongst', 'another',
    'any', 'anybody', 'anyone', 'anything', 'around', 'away',
    'back', 'because', 'before', 'behind', 'below', 'beside', 'besides', 'between',
    'beyond', 'both',
    'down', 'during', 'each', 'either', 'else', 'enough', 'even', 'ever', 'every',
    'everybody', 'everyone', 'everything', 'everywhere',
    'few', 'if', 'just', 'many', 'more', 'most', 'much', 'neither', 'never', 'none',
    'nobody', 'nothing', 'now', 'off', 'often', 'once', 'only', 'onto', 'other',
    'others', 'out', 'over', 'own', 'per', 'quite', 'rather', 'same', 'several',
    'since', 'so', 'some', 'somebody', 'someone', 'something', 'sometimes',
    'somewhere', 'still', 'such', 'too', 'under', 'until', 'up', 'upon', 'us',
    'very', 'via', 'when', 'where', 'whether', 'while', 'why', 'how', 'within',
    'without', 'yet', 'though', 'through', 'throughout',
}

# Nationality / language adjectives and calendar words stay even when capitalized.
KEEP_CAP = {
    'english', 'chinese', 'japanese', 'american', 'british', 'taiwanese', 'korean',
    'french', 'german', 'spanish', 'indian', 'asian', 'african', 'european',
    'australian', 'canadian', 'italian', 'russian', 'arabic',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
    'september', 'october', 'november', 'december',
    'christmas', 'internet',
}

BE_FORMS = {'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being'}

# --- KK -----------------------------------------------------------------

VOWEL_BASE = {
    'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
}
LAX = {'AE', 'EH', 'IH', 'UH', 'AH'}
KK = {
    'AA': 'ɑ', 'AE': 'æ', 'AO': 'ɔ', 'AW': 'aʊ', 'AY': 'aɪ',
    'EH': 'ɛ', 'EY': 'e', 'IH': 'ɪ', 'IY': 'i', 'OW': 'o', 'OY': 'ɔɪ',
    'UH': 'ʊ', 'UW': 'u',
    'B': 'b', 'CH': 'tʃ', 'D': 'd', 'DH': 'ð', 'F': 'f', 'G': 'g', 'HH': 'h',
    'JH': 'dʒ', 'K': 'k', 'L': 'l', 'M': 'm', 'N': 'n', 'NG': 'ŋ', 'P': 'p',
    'R': 'r', 'S': 's', 'SH': 'ʃ', 'T': 't', 'TH': 'θ', 'V': 'v', 'W': 'w',
    'Y': 'j', 'Z': 'z', 'ZH': 'ʒ',
}
ONSET2 = {
    ('P', 'L'), ('P', 'R'), ('B', 'L'), ('B', 'R'), ('T', 'R'), ('T', 'W'),
    ('D', 'R'), ('D', 'W'), ('K', 'L'), ('K', 'R'), ('K', 'W'), ('G', 'L'),
    ('G', 'R'), ('F', 'L'), ('F', 'R'), ('TH', 'R'), ('TH', 'W'), ('SH', 'R'),
    ('S', 'L'), ('S', 'W'), ('S', 'P'), ('S', 'T'), ('S', 'K'), ('S', 'M'),
    ('S', 'N'), ('S', 'F'), ('S', 'V'),
    ('P', 'Y'), ('B', 'Y'), ('K', 'Y'), ('G', 'Y'), ('F', 'Y'), ('V', 'Y'),
    ('M', 'Y'), ('N', 'Y'), ('HH', 'Y'),
}
ONSET3 = {
    ('S', 'P', 'L'), ('S', 'P', 'R'), ('S', 'T', 'R'), ('S', 'K', 'L'),
    ('S', 'K', 'R'), ('S', 'K', 'W'),
}


def phone_parts(p):
    m = re.match(r'^([A-Z]+)([0-2])?$', p)
    if not m:
        return p, None
    return m.group(1), m.group(2)


def is_vowel_phone(p):
    base, _ = phone_parts(p)
    return base in VOWEL_BASE


def kk_phone(p):
    base, stress = phone_parts(p)
    if base == 'AH':
        return 'ʌ' if stress in ('1', '2') else 'ə'
    if base == 'ER':
        return 'ɝ' if stress in ('1', '2') else 'ɚ'
    return KK.get(base, '')


def valid_onset(phones):
    if not phones:
        return True
    bases = [phone_parts(p)[0] for p in phones]
    if any(b in VOWEL_BASE or b == 'NG' for b in bases):
        return False
    if len(bases) == 1:
        return True
    if len(bases) == 2:
        return tuple(bases) in ONSET2
    if len(bases) == 3:
        return tuple(bases) in ONSET3
    return False


def syllabify(phones):
    """Phonological syllables. Each item is (stress, kk_text). stress is 0/1/2."""
    if not phones:
        return []
    vowels = [i for i, p in enumerate(phones) if is_vowel_phone(p)]
    if not vowels:
        return [(0, ''.join(kk_phone(p) for p in phones))]
    starts = [0]
    for vi in range(1, len(vowels)):
        prev, cur = vowels[vi - 1], vowels[vi]
        cons = phones[prev + 1:cur]
        onset_len = 0
        for n in range(len(cons), -1, -1):
            if valid_onset(cons[len(cons) - n:]):
                onset_len = n
                break
        base, stress = phone_parts(phones[prev])
        if stress == '1' and base in LAX and cons and onset_len == len(cons):
            if valid_onset(cons[1:]):
                onset_len -= 1
        starts.append(cur - onset_len)
    starts.append(len(phones))
    out = []
    for i, v in enumerate(vowels):
        chunk = phones[starts[i]:starts[i + 1]]
        stress = 0
        for p in chunk:
            _, st = phone_parts(p)
            if st == '1':
                stress = 1
            elif st == '2' and stress == 0:
                stress = 2
        out.append((stress, ''.join(kk_phone(p) for p in chunk)))
    return out


def format_kk(syls):
    parts = []
    for stress, text in syls:
        mark = 'ˈ' if stress == 1 else ('ˌ' if stress == 2 else '')
        parts.append(mark + text)
    return '·'.join(parts)


def map_index(n_phone, n_orth, phone_index):
    if n_orth <= 1:
        return 0
    if n_phone == n_orth:
        return max(0, min(n_orth - 1, phone_index))
    if n_phone <= 1:
        return 0
    return max(0, min(n_orth - 1, round(phone_index * (n_orth - 1) / (n_phone - 1))))


# --- morphology ----------------------------------------------------------

# (ending, display form without hyphen, zh, id). Longest first.
SUFFIXES = [
    ('ation', 'ation', '行為；結果', '-ation'),
    ('ition', 'ition', '行為；結果', '-ition'),
    ('tion', 'tion', '行為；結果', '-tion'),
    ('sion', 'sion', '行為；結果', '-sion'),
    ('ment', 'ment', '行為；結果', '-ment'),
    ('ness', 'ness', '性質；狀態', '-ness'),
    ('less', 'less', '沒有…的', '-less'),
    ('able', 'able', '能…的', '-able'),
    ('ible', 'ible', '能…的', '-ible'),
    ('ful', 'ful', '充滿…的', '-ful'),
    ('ous', 'ous', '具有…的', '-ous'),
    ('ive', 'ive', '有…傾向的', '-ive'),
    ('ity', 'ity', '性質', '-ity'),
    ('ly', 'ly', '…地', '-ly'),
    ('ist', 'ist', '…的人', '-ist'),
    ('ism', 'ism', '主義；狀態', '-ism'),
    ('ance', 'ance', '狀態；行為', '-ance'),
    ('ence', 'ence', '狀態；行為', '-ence'),
    ('ant', 'ant', '…的；…者', '-ant'),
    ('ent', 'ent', '…的；…者', '-ent'),
    ('ary', 'ary', '與…有關的', '-ary'),
    ('ory', 'ory', '與…有關的', '-ory'),
    ('er', 'er', '…的人', '-er'),
    ('or', 'or', '…的人', '-or'),
    ('al', 'al', '…的', '-al'),
    ('ic', 'ic', '…的', '-ic'),
    ('ed', 'ed', '…的', '-ed'),
    ('ing', 'ing', '…的', '-ing'),
    ('en', 'en', '使成為', '-en'),
]
# Inflectional endings are not 構詞. -ed/-ing only when the result is a
# distinct derived word we did not lemmatize away; still easy to fake, so
# the decomposer treats them as weak and prefers 不拆解 unless the stem is
# obvious AND the gloss overlaps. They are listed last and gated below.

SAFE_PREFIX = [
    ('counter', 'counter', '反；對抗', 'counter-'),
    ('inter', 'inter', '在…之間；互相', 'inter-'),
    ('trans', 'trans', '跨越；轉移', 'trans-'),
    ('under', 'under', '不足；在…之下', 'under-'),
    ('over', 'over', '過度；在…之上', 'over-'),
    ('super', 'super', '超過；在上', 'super-'),
    ('multi', 'multi', '多', 'multi-'),
    ('micro', 'micro', '微小', 'micro-'),
    ('extra', 'extra', '超出', 'extra-'),
    ('hyper', 'hyper', '過度', 'hyper-'),
    ('semi', 'semi', '半', 'semi-'),
    ('anti', 'anti', '反；抗', 'anti-'),
    ('auto', 'auto', '自己；自動', 'auto-'),
    ('fore', 'fore', '預先；前面', 'fore-'),
    ('mis', 'mis', '錯誤', 'mis-'),
    ('non', 'non', '非；不', 'non-'),
    ('post', 'post', '在…之後', 'post-'),
    ('tele', 'tele', '遠距離', 'tele-'),
    ('uni', 'uni', '單一', 'uni-'),
    ('tri', 'tri', '三', 'tri-'),
    ('pre', 'pre', '在前；預先', 'pre-'),
    ('sub', 'sub', '在下；次', 'sub-'),
    ('dis', 'dis', '不；除去；分開', 'dis-'),
    ('out', 'out', '超過；在外', 'out-'),
    ('re', 're', '再；重新', 're-'),
    ('bi', 'bi', '二；雙', 'bi-'),
    ('un', 'un', '不；相反', 'un-'),
]
# Only when the remainder is a bound root or a long free word we later accept.
ASSIM_PREFIX = [
    ('con', 'con', '共同；完全', 'con-'),
    ('com', 'com', '共同；完全', 'com-'),
    ('col', 'col', '共同', 'col-'),
    ('cor', 'cor', '共同', 'cor-'),
    ('pro', 'pro', '向前', 'pro-'),
    ('per', 'per', '貫穿；完全', 'per-'),
    ('en', 'en', '使…', 'en-'),
    ('em', 'em', '使…', 'em-'),
    ('ex', 'ex', '向外；前任', 'ex-'),
    ('de', 'de', '除去；向下', 'de-'),
    ('in', 'in', '不；向內', 'in-'),
    ('im', 'im', '不；向內', 'im-'),
    ('il', 'il', '不', 'il-'),
    ('ir', 'ir', '不', 'ir-'),
    ('co', 'co', '共同', 'co-'),
]

# Bound roots taught as real etymology. Value is (zh, family id).
ROOTS = {
    'dict': ('言；說', 'dict'), 'dic': ('言；說', 'dict'),
    'ject': ('投；擲', 'ject'),
    'spect': ('看', 'spect'), 'spic': ('看', 'spect'),
    'struct': ('建造', 'struct'),
    'duct': ('引導', 'duce'), 'duce': ('引導', 'duce'),
    'tract': ('拉；抽', 'tract'),
    'vert': ('轉', 'vert'), 'vers': ('轉', 'vert'),
    'miss': ('送；放出', 'mit'), 'mit': ('送；放出', 'mit'),
    'scribe': ('寫', 'scribe'), 'script': ('寫', 'scribe'),
    'graph': ('寫；圖', 'graph'), 'gram': ('寫；圖', 'graph'),
    'phon': ('聲音', 'phon'),
    'clude': ('關閉', 'clude'), 'clus': ('關閉', 'clude'),
    'ceive': ('拿；取', 'ceive'), 'cept': ('拿；取', 'ceive'),
    'press': ('壓', 'press'),
    'pend': ('懸；掛', 'pend'), 'pense': ('支付；稱', 'pend'),
    'rupt': ('打破', 'rupt'),
    'gress': ('走', 'gress'),
    'flex': ('彎曲', 'flex'), 'flect': ('彎曲', 'flex'),
    'port': ('攜帶；運', 'port'),
    'pose': ('放置', 'pose'), 'pos': ('放置', 'pose'), 'pon': ('放置', 'pose'),
    'tain': ('握住', 'tain'),
    'form': ('形狀', 'form'),
    'cred': ('相信', 'cred'),
    'audi': ('聽', 'aud'), 'aud': ('聽', 'aud'),
    'vis': ('看', 'vis'), 'vid': ('看', 'vis'), 'vide': ('看', 'vis'),
    'log': ('學問；言語', 'log'), 'ology': ('學問', 'log'),
    'bio': ('生命', 'bio'),
    'geo': ('大地', 'geo'),
    'chron': ('時間', 'chron'),
    'scope': ('看；鏡', 'scope'),
    'meter': ('測量', 'meter'),
    'photo': ('光', 'photo'),
    'hydro': ('水', 'hydro'),
    'therm': ('熱', 'therm'),
    'psych': ('心理', 'psych'),
    'bene': ('良好', 'bene'),
    'fract': ('打破', 'fract'), 'frag': ('打破', 'fract'),
    'lect': ('收集；選', 'lect'),
    'manu': ('手', 'manu'),
    'mot': ('移動', 'mov'), 'mov': ('移動', 'mov'), 'mob': ('移動', 'mov'),
    'pel': ('推', 'pel'), 'puls': ('推', 'pel'),
    'plic': ('折疊', 'plic'),
    'quest': ('尋求', 'quer'), 'quir': ('尋求', 'quer'), 'quis': ('尋求', 'quer'),
    'sens': ('感覺', 'sent'), 'sent': ('感覺', 'sent'),
    'sign': ('記號', 'sign'),
    'sist': ('站立', 'sist'),
    'tend': ('伸展；傾向', 'tend'), 'tens': ('伸展', 'tend'), 'tent': ('伸展', 'tend'),
    'ven': ('來', 'ven'), 'vent': ('來', 'ven'),
    'voc': ('聲音；叫', 'voc'), 'vok': ('叫', 'voc'), 'voke': ('叫', 'voc'),
    'volv': ('轉；捲', 'volv'), 'volut': ('轉；捲', 'volv'),
    'cess': ('走', 'ceed'), 'ceed': ('走', 'ceed'), 'cede': ('走', 'ceed'),
    'fer': ('帶來', 'fer'),
    'fin': ('結束；界限', 'fin'),
    'flu': ('流動', 'flu'),
    'gen': ('產生', 'gen'),
    'grad': ('等級；步', 'grad'),
    'junct': ('連接', 'junct'),
    'mem': ('記憶', 'mem'),
    'nat': ('出生', 'nat'),
    'nov': ('新', 'nov'),
    'oper': ('工作', 'oper'),
    'rect': ('正直', 'rect'),
    'sect': ('切開', 'sect'),
    'sequ': ('跟隨', 'sequ'),
    'serv': ('服務；保持', 'serv'),
    'tact': ('接觸', 'tact'),
    'terr': ('土地', 'terr'),
    'vac': ('空', 'vac'),
    'val': ('價值；力量', 'val'),
    'vit': ('生命', 'vit'), 'viv': ('生活', 'viv'),
}

# Structural splits that look real and are not.
OPAQUE = {
    'about', 'above', 'across', 'address', 'advertise', 'afternoon', 'again',
    'against', 'already', 'although', 'always', 'among', 'analysis', 'another',
    'answer', 'anything', 'anyway', 'appear', 'apply', 'approach', 'around',
    'arrive', 'article', 'attempt', 'attend', 'attention', 'available', 'avoid',
    'because', 'become', 'before', 'behind', 'believe', 'belong', 'beside',
    'besides', 'between', 'beyond', 'brother', 'business', 'career', 'certain',
    'challenge', 'character', 'children', 'college', 'comfortable',  # handled as comfort+able below via allow
    'comment', 'common', 'company', 'compare', 'complete', 'consider',
    'continue', 'control', 'conversation', 'country', 'couple', 'course',
    'create', 'culture', 'decide', 'deliver', 'describe', 'design', 'despite',
    'destroy', 'detail', 'determine', 'develop', 'difference', 'different',
    'difficult', 'dinner', 'discover', 'discuss', 'disease', 'display',
    'distance', 'district', 'during', 'early', 'either', 'else', 'engine',
    'engineer', 'enough', 'enter', 'environment', 'escape', 'especially',
    'establish', 'even', 'evening', 'ever', 'every', 'everybody', 'everyone',
    'everything', 'example', 'except', 'exercise', 'expect', 'experience',
    'experiment', 'explain', 'express', 'extreme', 'family', 'father',
    'feather', 'finger', 'flower', 'follow', 'foreign', 'forget', 'forward',
    'gather', 'general', 'government', 'however', 'hundred', 'husband',
    'imagine', 'immediate', 'important', 'increase', 'indeed', 'industry',
    'inside', 'instead', 'interest', 'interesting', 'into', 'introduce',
    'island', 'issue', 'itself', 'leather', 'letter', 'listen', 'little',
    'manage', 'manner', 'matter', 'measure', 'member', 'message', 'million',
    'modern', 'money', 'month', 'morning', 'mother', 'mountain', 'movement',
    'myself', 'nature', 'neither', 'never', 'newspaper', 'nothing', 'notice',
    'number', 'object', 'offer', 'office', 'often', 'onion', 'operate',
    'opinion', 'opportunity', 'order', 'other', 'otherwise', 'outside',
    'over', 'paper', 'parent', 'particular', 'people', 'perhaps', 'period',
    'person', 'personal', 'picture', 'planet', 'please', 'plenty', 'police',
    'popular', 'position', 'possible', 'power', 'practice', 'prepare',
    'present', 'president', 'pressure', 'pretty', 'prevent', 'private',
    'probably', 'problem', 'process', 'produce', 'product', 'program',
    'progress', 'project', 'promise', 'proper', 'protect', 'provide',
    'public', 'purpose', 'quality', 'quarter', 'question', 'rather',
    'ready', 'real', 'realize', 'really', 'reason', 'receive', 'recent',
    'recognize', 'recommend', 'record', 'reduce', 'refer', 'reflect',
    'refuse', 'regard', 'region', 'regular', 'relate', 'relation',
    'relationship', 'relative', 'remain', 'remember', 'remove', 'repair',
    'repeat', 'replace', 'reply', 'report', 'represent', 'require',
    'research', 'resource', 'respect', 'respond', 'response', 'responsible',
    'restaurant', 'result', 'return', 'reveal', 'river', 'season', 'second',
    'secret', 'section', 'secure', 'semester', 'separate', 'series',
    'serious', 'serve', 'service', 'several', 'shelter', 'shoulder',
    'silver', 'similar', 'simple', 'sister', 'situation', 'society',
    'someone', 'something', 'sometimes', 'somewhere', 'special', 'specific',
    'station', 'stomach', 'straight', 'strange', 'street', 'strong',
    'student', 'study', 'subject', 'succeed', 'success', 'such', 'sudden',
    'suffer', 'suggest', 'summer', 'supply', 'support', 'suppose', 'sure',
    'surface', 'surprise', 'survive', 'system', 'table', 'teacher',
    'temperature', 'therefore', 'though', 'thousand', 'through', 'together',
    'tomorrow', 'tonight', 'toward', 'traffic', 'travel', 'treat', 'trouble',
    'under', 'understand', 'understanding', 'university', 'unless', 'until',
    'upon', 'usual', 'usually', 'value', 'various', 'vegetable', 'village',
    'visit', 'voice', 'water', 'weather', 'whether', 'whole', 'within',
    'without', 'woman', 'women', 'wonder', 'world', 'yesterday', 'yourself',
}
# Words removed from OPAQUE because the split is the one we want to teach.
ALLOW_SPLIT = {
    'comfortable', 'uncomfortable', 'teacher', 'movement', 'government',
    'difference', 'different', 'relationship', 'personal', 'possible',
    'culture', 'natural', 'nation', 'national', 'international',
    'prediction', 'predictable', 'unpredictable', 'information',
    'education', 'development', 'agreement', 'management', 'statement',
    'careful', 'carefully', 'useful', 'hopeless', 'kindness', 'happiness',
    'quickly', 'slowly', 'really', 'usually', 'finally', 'actually',
    'especially', 'immediately', 'recently', 'suddenly',
    'discover', 'disagree', 'disappear', 'dishonest', 'disable',
    'rewrite', 'reuse', 'return', 'review', 'replace', 'remove', 'repeat',
    'preview', 'prepare', 'prevent', 'prefix',
    'overwork', 'overlook', 'overseas', 'underground', 'underline',
    'understand',  # keep opaque via not being compositional — leave out of allow
    'transport', 'translate', 'transfer', 'transform',
    'interact', 'international', 'interview', 'internet',
    'submarine', 'subway', 'submit',
    'misunderstand', 'mistake',
    'nonstop', 'nonsense',
    'unable', 'unhappy', 'unfair', 'unknown', 'unusual', 'unnecessary',
    'unemployment', 'unexpected', 'unfortunately',
    'biology', 'geography', 'telephone', 'television', 'automatic',
    'photograph', 'photography',
    'import', 'export', 'important',
    'include', 'conclude', 'exclude',
    'describe', 'description',
    'produce', 'product', 'production', 'introduce', 'introduction',
    'reduce', 'conduct', 'education',
    'progress', 'congress',
    'attract', 'contract', 'subtract',
    'convert', 'conversation',
    'admit', 'permit', 'submit', 'commit', 'promise',
    'decide', 'decision',
    'receive', 'accept', 'except',
    'depend', 'independent', 'expensive',
    'support', 'opportunity',
    'collect', 'collection', 'select', 'election',
    'visible', 'vision', 'visit', 'provide', 'evidence',
    'audience', 'audio',
    'credit', 'incredible',
    'interrupt', 'bankrupt',
    'flexible', 'reflect',
    'pressure', 'express', 'impress',
    'contain', 'maintain', 'obtain', 'entertain',
    'inform', 'formal', 'information', 'perform', 'performance',
    'believe', 'belief',
    'create', 'creation', 'creative',
    'act', 'action', 'active', 'activity', 'actor', 'actually',
    'success', 'successful', 'succeed',
    'science', 'scientific', 'scientist',
    'music', 'musical', 'musician',
    'history', 'historical',
    'politics', 'political', 'politician',
    'economy', 'economic', 'economical',
    'environment', 'environmental',
    'industry', 'industrial',
    'agriculture', 'agricultural',
    'advantage', 'disadvantage',
    'employ', 'employee', 'employer', 'employment', 'unemployment',
    'communicate', 'communication',
    'organize', 'organization',
    'pollute', 'pollution',
    'suggest', 'suggestion',
    'invent', 'invention', 'inventor',
    'direct', 'direction', 'director', 'directly',
    'protect', 'protection',
    'connect', 'connection',
    'construct', 'construction',
    'instruct', 'instruction',
    'destroy', 'destruction',
    'consume', 'consumer',
    'compete', 'competition', 'competitive',
    'operate', 'operation',
    'consider', 'considerable', 'consideration',
    'possible', 'impossible', 'possibility',
    'responsible', 'responsibility',
    'available', 'availability',
    'comfortable',
    'pleasure', 'pleasant',
    'danger', 'dangerous',
    'fame', 'famous',
    'nerve', 'nervous',
    'humor', 'humorous', 'humour',
    'courage', 'courageous', 'encourage',
    'vary', 'various',
    'continue', 'continuous',
    'use', 'useful', 'useless', 'user',
    'care', 'careful', 'careless',
    'help', 'helpful', 'helpless', 'helper',
    'hope', 'hopeful', 'hopeless',
    'power', 'powerful', 'powerless',
    'meaning', 'meaningful', 'meaningless',
    'color', 'colorful', 'colour', 'colourful',
    'beauty', 'beautiful',
    'wonder', 'wonderful',
    'success', 'successful',
    'friend', 'friendly', 'friendship',
    'week', 'weekly', 'day', 'daily',
    'happy', 'happiness', 'unhappy',
    'kind', 'kindness',
    'ill', 'illness',
    'weak', 'weakness',
    'dark', 'darkness',
    'aware', 'awareness',
    'fit', 'fitness',
    'quick', 'quickly',
    'slow', 'slowly',
    'careful', 'carefully',
    'easy', 'easily', 'easier',
    'heavy', 'heavily',
    'angry', 'angrily',
    'final', 'finally',
    'actual', 'actually',
    'general', 'generally',
    'natural', 'naturally',
    'normal', 'normally',
    'original', 'originally',
    'personal', 'personally',
    'physical', 'physically',
    'recent', 'recently',
    'serious', 'seriously',
    'slight', 'slightly',
    'complete', 'completely',
    'immediate', 'immediately',
    'unfortunate', 'unfortunately',
    'usual', 'usually', 'unusual',
    'exact', 'exactly',
    'loud', 'loudly',
    'quiet', 'quietly',
    'safe', 'safely', 'safety',
    'polite', 'politely',
    'strong', 'strongly',
    'correct', 'correctly',
    'different', 'differently', 'difference',
    'important', 'importantly', 'importance',
    'possible',
    'probable', 'probably',
    'comfortable',
    'reasonable', 'reasonably',
    'valuable',
    'acceptable',
    'avoidable', 'unavoidable',
    'believable', 'unbelievable',
    'readable',
    'washable',
    'countable', 'uncountable',
    'fashionable',
    'memorable',
    'noticeable',
    'reliable', 'unreliable',
    'suitable',
    'bearable', 'unbearable',
    'desirable',
    'enjoyable',
    'favorable', 'favourable',
    'miserable',
    'portable',
    'preferable',
    'profitable',
    'remarkable',
    'respectable',
    'sensible',
    'terrible',
    'visible', 'invisible',
    'flexible',
    'responsible', 'irresponsible',
    'possible', 'impossible',
    'worker', 'teacher', 'driver', 'player', 'singer', 'dancer', 'writer',
    'reader', 'speaker', 'listener', 'learner', 'owner', 'leader', 'manager',
    'farmer', 'officer', 'visitor', 'inventor', 'actor', 'director',
    'operator', 'competitor', 'consumer', 'customer',
    'agreement', 'argument', 'arrangement', 'announcement', 'appointment',
    'development', 'employment', 'enjoyment', 'equipment', 'government',
    'improvement', 'management', 'movement', 'payment', 'punishment',
    'requirement', 'statement', 'treatment', 'achievement', 'advertisement',
    'amusement', 'attachment', 'commitment', 'department', 'document',
    'environment', 'experiment', 'instrument', 'investment', 'measurement',
    'pavement', 'replacement', 'settlement', 'shipment',
    'action', 'addition', 'admission', 'attention', 'attraction',
    'collection', 'communication', 'competition', 'conclusion', 'condition',
    'connection', 'construction', 'contribution', 'conversation', 'creation',
    'decision', 'definition', 'description', 'direction', 'discussion',
    'education', 'election', 'emotion', 'examination', 'exhibition',
    'expectation', 'explanation', 'expression', 'generation', 'imagination',
    'impression', 'information', 'instruction', 'introduction', 'invention',
    'invitation', 'location', 'nation', 'operation', 'organization',
    'pollution', 'population', 'position', 'possession', 'prediction',
    'preparation', 'production', 'profession', 'promotion', 'protection',
    'reaction', 'recommendation', 'reduction', 'relation', 'reputation',
    'reservation', 'situation', 'solution', 'suggestion', 'tradition',
    'translation', 'transportation', 'vacation',
}

# Remove understand from allow if I added it — I mentioned it in a comment
# inside the set by accident? Looking at the set, 'understand' is NOT in
# ALLOW_SPLIT except a comment. Good. 'teacher' is in OPAQUE and ALLOW.
# ALLOW wins.

WEAK_SUFFIX = {'-ed', '-ing', '-er', '-or', '-al', '-ic', '-en', '-ly'}


def strip_suffix(word):
    """Yield (stem, suffix_tuple) for a real-looking suffix."""
    for ending, form, zh, sid in SUFFIXES:
        if not word.endswith(ending) or len(word) <= len(ending) + 2:
            continue
        stem = word[:-len(ending)]
        cands = [stem]
        if stem.endswith('i'):
            cands.append(stem[:-1] + 'y')
        if not stem.endswith('e'):
            cands.append(stem + 'e')
        # double consonant: runner → run, bigger already lemmatized
        if len(stem) >= 3 and stem[-1] == stem[-2] and stem[-1] not in 'aeiou':
            cands.append(stem[:-1])
        yield cands, (form, zh, sid)


def strip_prefix(word, table):
    for form, disp, zh, sid in table:
        if word.startswith(form) and len(word) > len(form) + 2:
            yield word[len(form):], (disp, zh, sid)


def cjk_key(text):
    chars = re.findall(r'[\u4e00-\u9fff]', text or '')
    stop = set('的了是不無非再被把與和或在及而並也又就都很最更這那')
    return [c for c in chars if c not in stop]


def gloss_overlap(stem_zh, word_zh):
    a, b = set(cjk_key(stem_zh)), set(cjk_key(word_zh))
    if not a or not b:
        return False
    return bool(a & b)


def shorten_zh(text, n=14):
    t = re.sub(r'（[^）]*）|\([^)]*\)', '', text or '')
    t = t.strip(' ；;，,。.')
    t = t.split('。')[0]
    # first sense cluster
    parts = re.split(r'[；;]', t)
    t = parts[0].strip()
    if len(t) > n and '、' in t:
        bits = t.split('、')
        acc = bits[0]
        for b in bits[1:]:
            if len(acc) + 1 + len(b) <= n:
                acc += '、' + b
            else:
                break
        t = acc
    return t[:n].rstrip('、，, ')


# --- dictionaries --------------------------------------------------------

def load_cmu(path):
    pron = {}
    for line in path.read_text(encoding='utf-8', errors='ignore').splitlines():
        if not line or line.startswith(';;;'):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        w = parts[0].lower()
        w = re.sub(r'\(\d+\)$', '', w)
        if not re.fullmatch(r"[a-z][a-z'-]*", w):
            continue
        pron.setdefault(w, parts[1:])
    return pron


def load_mhyph(path):
    text = path.read_bytes().decode('mac_roman')
    idx = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or ' ' in line or '-' in line:
            continue
        syls = [s for s in line.split('•') if s]
        if not syls:
            continue
        key = ''.join(syls).lower()
        if not re.fullmatch(r"[a-z']+", key):
            continue
        idx.setdefault(key, [s.lower() for s in syls])
    return idx


def parse_exchange(field):
    out = []
    for part in (field or '').split('/'):
        if ':' not in part:
            continue
        k, v = part.split(':', 1)
        v = v.strip().lower()
        if v:
            out.append((k.strip(), v))
    return out


POS_MAP = {
    'n': 'n.', 'v': 'v.', 'vt': 'v.', 'vi': 'v.', 'aux': 'v.',
    'a': 'adj.', 'adj': 'adj.', 'ad': 'adv.', 'adv': 'adv.',
    'prep': 'prep.', 'conj': 'conj.', 'pron': 'pron.',
    'art': 'art.', 'num': 'num.', 'int': 'interj.', 'pl': 'n.',
}
POS_LINE = re.compile(
    r'^(n|v|vt|vi|aux|a|adj|ad|adv|prep|conj|pron|art|num|int|pl)\.\s*(.+)$',
    re.I,
)


def parse_translation(tr):
    senses = []
    text = (tr or '').replace('\\n', '\n').replace('\\r', '\n').replace('\\t', ' ')
    for line in text.splitlines():
        m = POS_LINE.match(line.strip())
        if not m:
            continue
        pos = POS_MAP.get(m.group(1).lower(), '')
        gloss = m.group(2).strip()
        if pos and gloss:
            senses.append((pos, gloss))
    return senses


# Dictionary-first senses that are misleading for this exam bank.
GLOSS_FIX = {
    'communicate': ('v.', '溝通'),
    'flexible': ('adj.', '有彈性的'),
    'predict': ('v.', '預測'),
    'respond': ('v.', '回應'),
    'disappoint': ('v.', '使失望'),
    'collect': ('v.', '收集'),
    'remove': ('v.', '移除'),
    'convert': ('v.', '轉換'),
    'environment': ('n.', '環境'),
    'environmental': ('adj.', '環境的'),
    'depend': ('v.', '依賴'),
    'import': ('v.', '進口'),
    'submit': ('v.', '提交'),
    'presentation': ('n.', '簡報'),
    'beautiful': ('adj.', '美麗的'),
}


def load_ecdict(path, wanted_surfaces):
    """Stream ECDICT. Keep compact records for candidates and build lemma map."""
    records = {}
    lemma_of = {}
    wanted = set(wanted_surfaces)

    def keep_row(word, exchange_forms):
        if word in wanted:
            return True
        return any(f in wanted for f in exchange_forms)

    with path.open(encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            word = (row.get('word') or '').strip().lower()
            if not word or ' ' in word or not re.fullmatch(r"[a-z][a-z'-]*", word):
                continue
            ex = parse_exchange(row.get('exchange') or '')
            forms = [v for _, v in ex]
            # lemma links for every row (small), records only when relevant
            for k, v in ex:
                if k in {'p', 'd', 'i', '3', 's', 'r', 't'} and v and v != word:
                    lemma_of.setdefault(v, word)
                elif k == '0' and v and v != word:
                    lemma_of.setdefault(word, v)
            try:
                frq = int(row.get('frq') or 0)
            except ValueError:
                frq = 0
            # Keep every ranked headword so 構詞 can see stems that are not themselves in the exam.
            if frq <= 0 and not keep_row(word, forms):
                continue
            senses = parse_translation(row.get('translation') or '')
            records[word] = {
                'senses': senses,
                'frq': frq,
                'tag': row.get('tag') or '',
            }
    return records, lemma_of


def second_pass_lemmas(path, lemmas_needed, records):
    need = {w for w in lemmas_needed if w not in records}
    if not need:
        return
    with path.open(encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            word = (row.get('word') or '').strip().lower()
            if word not in need:
                continue
            senses = parse_translation(row.get('translation') or '')
            try:
                frq = int(row.get('frq') or 0)
            except ValueError:
                frq = 0
            records[word] = {'senses': senses, 'frq': frq, 'tag': row.get('tag') or ''}
            need.discard(word)
            if not need:
                break


# --- quiz walk -----------------------------------------------------------

def iter_questions(data):
    for key, val in data.items():
        if key in {'meta', 'recall'} or not isinstance(val, list):
            continue
        for q in val:
            if isinstance(q, dict) and (q.get('stem') or q.get('passage')):
                yield q


def question_blobs(q):
    parts = [q.get('stem') or '', q.get('passage') or '', q.get('explain') or '']
    for c in q.get('choices') or []:
        parts.append(str(c))
    for w in q.get('words') or []:
        if isinstance(w, dict):
            parts.append(w.get('en') or '')
    for p in q.get('phrases') or []:
        if isinstance(p, dict):
            parts.append(p.get('en') or '')
    return '\n'.join(parts)


def sentence_starts(text):
    """Return set of match spans' start indexes that are sentence-initial."""
    starts = {0}
    for m in re.finditer(r'[.!?]\s+|[\"“”]\s*', text):
        starts.add(m.end())
    # also after newline
    for m in re.finditer(r'\n\s*', text):
        starts.add(m.end())
    return starts


def iter_word_tokens(text):
    starts = sentence_starts(text)
    for m in WORD_RE.finditer(text):
        raw = m.group(0).replace('’', "'")
        if "'" in raw or raw.lower() in {"'s", "s"}:
            continue
        sent = m.start() in starts or m.start() == 0
        # a token after a letter-free prefix at column 0 of a line counts
        yield raw, sent


INFLECT_NOTE = re.compile(r'過去|現在分詞|第三人稱|複數|比較級|最高級|原型')


def clean_exam_zh(zh):
    if not zh:
        return ''
    if INFLECT_NOTE.search(zh):
        return ''
    t = re.sub(r'（[^）]*）|\([^)]*\)', '', zh)
    t = t.split('。')[0]
    t = t.strip(' ；;，,。.')
    # drop trailing grammar notes
    t = re.split(r'[，,]', t)[0]
    t = t.strip()
    if not re.search(r'[\u4e00-\u9fff]', t):
        return ''
    if len(t) > 18:
        t = shorten_zh(t, 16)
    return t


def tidy_zh(text, n=12):
    """First one or two dictionary senses, Traditional, no tags."""
    t = str(text or '')
    t = re.sub(r'\[[^\]]*\]', '', t)
    t = re.sub(r'（[^）]*）|\([^)]*\)', '', t)
    t = t.replace('\n', '；')
    t = re.split(r'[；;。]', t)[0]
    bits = []
    for b in re.split(r'[,，、]', t):
        b = b.strip(' ；;，,。.')
        b = re.sub(r'^(n|v|vt|vi|a|adj|adv|prep|conj|pron|pl)\.\s*', '', b, flags=re.I)
        if not b or not re.search(r'[\u4e00-\u9fff]', b):
            continue
        if re.search(r'人名|地名|等於|等于|的過去|過去式|過去分詞', b):
            continue
        bits.append(b)
        if len(bits) >= 2:
            break
    out = '、'.join(bits)
    return shorten_zh(out, n)


def primary_gloss(record, cc):
    if not record:
        return '', ''
    for pos, g in record.get('senses') or []:
        raw = cc.convert(g).replace('\\n', '\n')
        raw = re.sub(r'\[[^\]]*\]', '', raw)
        raw = re.split(r'[\n]', raw)[0]
        raw = re.sub(r'（[^）]*）|\([^)]*\)', '', raw)
        for bit in re.split(r'[,，]', raw):
            bit = re.sub(r'\s+', '', bit)
            if not re.search(r'[\u4e00-\u9fff]', bit):
                continue
            if '...' in bit or '…' in bit or re.search(r'人名|地名|等於|等于', bit):
                continue
            return pos, bit[:12]
    return '', ''


def regular_lemma(surface, records):
    w = surface
    cands = []
    if w.endswith('ies') and len(w) > 4:
        cands.append(w[:-3] + 'y')
    if w.endswith('es') and len(w) > 4:
        cands.append(w[:-2])
        cands.append(w[:-1])
    if w.endswith('s') and not w.endswith('ss') and len(w) > 3:
        cands.append(w[:-1])
    if w.endswith('ied') and len(w) > 4:
        cands.append(w[:-3] + 'y')
    if w.endswith('ed') and len(w) > 4:
        cands.append(w[:-2])
        cands.append(w[:-1])  # hoped → hope? hope+d = hoped, strip ed → hop, strip d → hope
        if w[:-2].endswith(w[-3:-2]) and len(w) > 5:
            cands.append(w[:-3])
    if w.endswith('ing') and len(w) > 5:
        cands.append(w[:-3])
        cands.append(w[:-3] + 'e')
        if len(w) > 6 and w[-4] == w[-5] and w[-4] not in 'aeiou':
            cands.append(w[:-4])
    if w.endswith('er') and len(w) > 4:
        cands.append(w[:-2])
        cands.append(w[:-1])
    if w.endswith('est') and len(w) > 5:
        cands.append(w[:-3])
        cands.append(w[:-2])
    if w.endswith('ier') and len(w) > 4:
        cands.append(w[:-3] + 'y')
    if w.endswith('iest') and len(w) > 5:
        cands.append(w[:-4] + 'y')
    for c in cands:
        if c in records and c != w:
            return c
    return None


# --- main ----------------------------------------------------------------

def load_overrides():
    if not OVR_PATH.exists():
        return {'words': {}, 'phrases': {}}
    data = json.loads(OVR_PATH.read_text(encoding='utf-8'))
    data.setdefault('words', {})
    data.setdefault('phrases', {})
    return data


def main():
    try:
        import opencc
    except ImportError:
        print('need opencc: pip install opencc-python-reimplemented', file=sys.stderr)
        sys.exit(1)
    cc = opencc.OpenCC('s2twp')
    for p in (CACHE / 'cmudict.dict', CACHE / 'mhyph.txt', CACHE / 'ecdict.csv'):
        if not p.exists():
            print('missing cache', p, file=sys.stderr)
            sys.exit(1)

    quiz = json.loads(QUIZ.read_text(encoding='utf-8'))
    questions = list(iter_questions(quiz))
    cmu = load_cmu(CACHE / 'cmudict.dict')
    mhyph = load_mhyph(CACHE / 'mhyph.txt')

    # Pass 1: surfaces
    surfaces = set()
    cap_stats = defaultdict(lambda: [0, 0, 0])  # mid, lower, sent
    gloss_votes = defaultdict(Counter)  # surface -> zh counter
    phrase_listed = {}  # norm -> {zh, raws}
    qmeta = []

    for q in questions:
        qid = q.get('id') or ''
        year = int(q.get('year') or 0)
        qnum = int(q.get('qnum') or 0)
        text = question_blobs(q)
        lemmas_later = []
        tokens = []
        for raw, sent in iter_word_tokens(text):
            low = raw.lower().replace("'", "'")
            if not low.isalpha():
                # allow internal apostrophe already stripped by WORD_RE except '
                low = re.sub(r"[^a-z]", '', low)
            if len(low) < 2:
                continue
            surfaces.add(low)
            tokens.append(low)
            st = cap_stats[low]
            if raw[:1].isupper() and not sent and raw.lower() != 'i':
                st[0] += 1
            elif raw.islower():
                st[1] += 1
            else:
                st[2] += 1
        for w in q.get('words') or []:
            if not isinstance(w, dict):
                continue
            en = (w.get('en') or '').strip()
            zh = clean_exam_zh(w.get('zh') or '')
            for raw, _ in iter_word_tokens(en):
                low = re.sub(r"[^a-z]", '', raw.lower())
                if len(low) >= 2:
                    surfaces.add(low)
                    if zh and ' ' not in en and '-' not in en:
                        gloss_votes[low][zh] += 1
        for p in q.get('phrases') or []:
            if not isinstance(p, dict):
                continue
            en = re.sub(r'\s+', ' ', (p.get('en') or '').strip())
            zh = clean_exam_zh(p.get('zh') or '') or shorten_zh(cc.convert(p.get('zh') or ''), 20)
            if en and ' ' in en:
                slot = phrase_listed.setdefault(en.lower(), {'zh': Counter(), 'raw': en, 'qs': []})
                slot['qs'].append(q)
                if zh:
                    slot['zh'][zh] += 2
        # 片語只收題目資料裡的 phrases，不把詳解的整句選項譯文算進來。
        qmeta.append({'id': qid, 'y': year, 'n': qnum, 'text': text, 'tokens': tokens})

    print(f'questions {len(qmeta)} surfaces {len(surfaces)}', file=sys.stderr)
    records, lemma_of = load_ecdict(CACHE / 'ecdict.csv', surfaces)
    # lemmas referenced
    needed = set()
    for s in list(surfaces):
        lem = lemma_of.get(s)
        if lem:
            needed.add(lem)
        reg = regular_lemma(s, records) if s in records or True else None
        # regular_lemma needs records of candidates; fill after we know
    # Ensure lemma targets exist. regular_lemma checks records, so load likely bases.
    bases = set()
    for s in surfaces:
        if s.endswith('ing') and len(s) > 5:
            bases.add(s[:-3]); bases.add(s[:-3] + 'e')
        if s.endswith('ed') and len(s) > 4:
            bases.add(s[:-2]); bases.add(s[:-1])
        if s.endswith('es') and len(s) > 4:
            bases.add(s[:-2])
        if s.endswith('s') and len(s) > 3:
            bases.add(s[:-1])
        if s.endswith('ies') and len(s) > 4:
            bases.add(s[:-3] + 'y')
        lem = lemma_of.get(s)
        if lem:
            bases.add(lem)
    second_pass_lemmas(CACHE / 'ecdict.csv', bases | needed, records)
    # recompute regular now that bases are loaded
    for s in surfaces:
        if s in lemma_of:
            continue
        # A ranked headword (species, always) is not an inflection of a rarer lookalike.
        rec = records.get(s)
        if rec and (rec.get('frq') or 0) > 0:
            continue
        reg = regular_lemma(s, records)
        if reg and reg != s:
            lemma_of[s] = reg

    def lemma_of_word(surface):
        lem = lemma_of.get(surface, surface)
        if not lem or lem == surface:
            return surface
        if lem not in cmu and surface in cmu:
            return surface
        rec = records.get(surface) or {}
        lrec = records.get(lem) or {}
        sf, lf = rec.get('frq') or 0, lrec.get('frq') or 0
        # Ranked -ing headwords stay (according, building). Rare gerunds still fold back.
        if surface.endswith('ing') and sf > 0:
            return surface
        # Don't collapse a real headword into an unranked or much rarer lemma.
        if sf and (lf == 0 or lf > sf * 4) and not re.search(r'(?:ied|ed|ing|ies|es|s)$', surface):
            return surface
        return lem if (lem in records or lem in cmu) else surface

    # Proper names
    names = set()
    for w, (mid, low, sent) in cap_stats.items():
        if w in KEEP_CAP or w in HARD_FUNCTION:
            continue
        total_cap_use = mid
        other = low
        if total_cap_use >= 1 and other == 0 and sent <= total_cap_use and w not in records:
            names.add(w)
            continue
        if total_cap_use >= 2 and total_cap_use >= other and w not in KEEP_CAP:
            # dictionary words that also appear in lowercase are not names
            if other == 0:
                names.add(w)
            elif total_cap_use > other * 3 and (records.get(w, {}).get('frq', 0) < 200):
                rec = records.get(w)
                zh = ''
                if rec and rec['senses']:
                    zh = rec['senses'][0][1]
                if re.search(r'人名|地名|国名|國名|城市', zh or ''):
                    names.add(w)
                elif other == 0:
                    names.add(w)

    # Build word entries
    src_map = defaultdict(list)  # lemma -> list of sources
    seen_pair = defaultdict(set)
    exam_zh = defaultdict(Counter)

    def add_src(lem, q):
        key = (q['y'], q['n'], q['id'])
        if key in seen_pair[lem]:
            return
        seen_pair[lem].add(key)
        src_map[lem].append({'id': q['id'], 'y': q['y'], 'n': q['n']})

    for s, counter in gloss_votes.items():
        lem = lemma_of_word(s)
        for zh, n in counter.items():
            exam_zh[lem][zh] += n

    for q in qmeta:
        seen_lem = set()
        for tok in q['tokens']:
            if tok in HARD_FUNCTION or tok in names:
                continue
            lem = lemma_of_word(tok)
            if lem in HARD_FUNCTION or lem in names:
                continue
            if lem in SOFT_FUNCTION and lem not in TEACH_FUNCTION:
                continue
            if len(lem) < 2:
                continue
            if lem not in records and lem not in cmu and lem not in exam_zh:
                continue
            seen_lem.add(lem)
        for lem in seen_lem:
            add_src(lem, q)

    # phrases: only the curated phrases[] list, 2–5 words, with a content word.
    def norm_phrase(text):
        toks = []
        for raw in re.findall(r"[A-Za-z']+", text.lower().replace('’', "'")):
            t = raw.strip("'")
            if not t:
                continue
            if t in BE_FORMS:
                toks.append('be')
                continue
            if t.endswith('ing'):
                toks.append(t)
                continue
            toks.append(lemma_of_word(t))
        return toks

    phrases = {}
    for key, info in phrase_listed.items():
        if re.search(r'[.!?]', info['raw']):
            continue
        toks = norm_phrase(info['raw'])
        if len(toks) < 2 or len(toks) > 5:
            continue
        if not any(t not in HARD_FUNCTION and t not in SOFT_FUNCTION and t not in BE_FORMS for t in toks):
            continue
        if any(t in {'i', 'you', 'he', 'she', 'we', 'they', 'it', 'me', 'him', 'them', 'us'} for t in toks):
            continue
        if 'be' in toks and toks[0] != 'be':
            continue
        norm = ' '.join(toks)
        zh = ''
        if info['zh']:
            zh = tidy_zh(info['zh'].most_common(1)[0][0], 16)
        if not zh:
            continue
        slot = phrases.setdefault(norm, {'w': norm, 'zh': zh, 'src': [], 'seen': set()})
        if len(zh) < len(slot['zh'] or 'x' * 99):
            slot['zh'] = zh
        for q in info['qs']:
            qid = q.get('id') or ''
            if qid in slot['seen']:
                continue
            slot['seen'].add(qid)
            slot['src'].append({'id': qid, 'y': int(q.get('year') or 0), 'n': int(q.get('qnum') or 0)})

    overrides = load_overrides()

    def pronounce(word):
        phones = cmu.get(word)
        if not phones and word.endswith('s') and word[:-1] in cmu:
            phones = cmu[word[:-1]]
        syl = mhyph.get(word)
        if phones:
            psy = syllabify(phones)
        else:
            psy = []
        if not syl and psy:
            # one spelling chunk per spoken syllable is unknown; keep whole word
            syl = [word]
        if not syl:
            syl = [word]
        p_index = 0
        sec_index = None
        stresses = [s for s, _ in psy] or [0]
        if 1 in stresses:
            p_index = stresses.index(1)
        if 2 in stresses:
            sec_index = stresses.index(2)
        stress = map_index(len(psy) or 1, len(syl), p_index)
        sec = None if sec_index is None else map_index(len(psy) or 1, len(syl), sec_index)
        if sec == stress:
            sec = None
        kk = format_kk(psy) if psy else ''
        return syl, stress, sec, kk

    # Bound-root splits that really compose. Anything else stays 不拆解
    # unless a free English word plus a productive affix overlaps in meaning.
    CURATED = {
        'predict': [('prefix', 'pre-', 'pre', '在前；預先'), ('root', 'dict', 'dict', '言；說')],
        'visible': [('root', 'vis', 'vis', '看'), ('suffix', '-ible', 'ible', '能…的')],
        'flexible': [('root', 'flex', 'flex', '彎曲'), ('suffix', '-ible', 'ible', '能…的')],
        'interrupt': [('prefix', 'inter-', 'inter', '在…之間'), ('root', 'rupt', 'rupt', '打破')],
        'receive': [('prefix', 're-', 're', '再'), ('root', 'ceive', 'ceive', '拿；取')],
        'submit': [('prefix', 'sub-', 'sub', '在下'), ('root', 'mit', 'mit', '送出')],
        'transmit': [('prefix', 'trans-', 'trans', '傳送'), ('root', 'mit', 'mit', '送出')],
        'prescribe': [('prefix', 'pre-', 'pre', '預先'), ('root', 'scribe', 'scribe', '寫')],
        'describe': [('prefix', 'de-', 'de', '下'), ('root', 'scribe', 'scribe', '寫')],
        'transport': [('prefix', 'trans-', 'trans', '跨越'), ('root', 'port', 'port', '運送')],
        'transportation': [('prefix', 'trans-', 'trans', '跨越'), ('root', 'port', 'port', '運送'), ('suffix', '-ation', 'ation', '行為')],
        'import': [('prefix', 'im-', 'im', '向內'), ('root', 'port', 'port', '運送')],
        'export': [('prefix', 'ex-', 'ex', '向外'), ('root', 'port', 'port', '運送')],
        'include': [('prefix', 'in-', 'in', '向內'), ('root', 'clude', 'clude', '關住')],
        'exclude': [('prefix', 'ex-', 'ex', '向外'), ('root', 'clude', 'clude', '關住')],
        'collect': [('prefix', 'col-', 'col', '一起'), ('root', 'lect', 'lect', '收集')],
        'contain': [('prefix', 'con-', 'con', '一起'), ('root', 'tain', 'tain', '握住')],
        'contact': [('prefix', 'con-', 'con', '共同'), ('root', 'tact', 'tact', '接觸')],
        'compose': [('prefix', 'com-', 'com', '一起'), ('root', 'pose', 'pose', '放置')],
        'depend': [('prefix', 'de-', 'de', '從'), ('root', 'pend', 'pend', '懸掛')],
        'distract': [('prefix', 'dis-', 'dis', '拉開'), ('root', 'tract', 'tract', '拉')],
        'prevent': [('prefix', 'pre-', 'pre', '提前'), ('root', 'vent', 'vent', '來')],
        'telephone': [('prefix', 'tele-', 'tele', '遠'), ('root', 'phon', 'phon', '聲音')],
        'audience': [('root', 'aud', 'aud', '聽'), ('suffix', '-ence', 'ence', '的人')],
        'position': [('root', 'pos', 'pos', '放置'), ('suffix', '-ition', 'ition', '結果')],
        'convert': [('prefix', 'con-', 'con', '轉變'), ('root', 'vert', 'vert', '轉')],
        'remove': [('prefix', 're-', 're', '再'), ('stem', 'move', 'move', '移動')],
    }
    ALGO_SUF = [
        ('ation', 'ation', '行為；結果', '-ation'),
        ('ition', 'ition', '行為；結果', '-ition'),
        ('tion', 'tion', '行為；結果', '-tion'),
        ('sion', 'sion', '行為；結果', '-sion'),
        ('ion', 'ion', '行為；結果', '-ion'),
        ('ment', 'ment', '行為；結果', '-ment'),
        ('ness', 'ness', '性質', '-ness'),
        ('less', 'less', '沒有…的', '-less'),
        ('able', 'able', '能…的', '-able'),
        ('ible', 'ible', '能…的', '-ible'),
        ('ful', 'ful', '充滿…的', '-ful'),
        ('ous', 'ous', '具有…的', '-ous'),
        ('ive', 'ive', '…的', '-ive'),
        ('ity', 'ity', '性質', '-ity'),
        ('ance', 'ance', '狀態', '-ance'),
        ('ence', 'ence', '狀態', '-ence'),
        ('ist', 'ist', '…者', '-ist'),
        ('ism', 'ism', '主義', '-ism'),
        ('ly', 'ly', '…地', '-ly'),
        ('er', 'er', '…的人', '-er'),
        ('or', 'or', '…的人', '-or'),
        ('al', 'al', '…的', '-al'),
    ]

    def pack_morph(parts, zh):
        bits = [f"{form}（{pzh}）" for _k, _i, form, pzh in parts]
        arrow = tidy_zh(zh, 14) or zh
        formula = ' + '.join(bits) + (f' → {arrow}' if arrow else '')
        root_id = None
        for kind, ident, _form, _pzh in parts:
            if kind in {'root', 'stem'}:
                root_id = ident
                break
        return {
            'ok': True,
            'parts': [{'k': k, 'id': i, 'f': f, 'zh': z} for k, i, f, z in parts],
            'formula': formula,
            'root': root_id,
        }

    def decompose(word, zh, pos):
        if word in CURATED:
            return pack_morph(CURATED[word], zh)
        if word in {
            'resource', 'layer', 'liver', 'subjective', 'annually', 'mainly', 'partly',
            'firstly', 'newly', 'master', 'medical', 'portal', 'subway', 'solution',
            'outside', 'transmission', 'importance', 'picker',
        }:
            return None
        if len(word) < 5 and not word.startswith('un'):
            return None
        if re.search(r'人名|地名', zh or ''):
            return None

        BLOCK = {
            'resource', 'layer', 'liver', 'subjective', 'annually', 'mainly', 'partly',
            'firstly', 'newly', 'master', 'medical', 'portal', 'subway', 'solution',
            'outside', 'transmission', 'importance', 'picker',
        }

        def sense_bits(stem):
            rec = records.get(stem) or {}
            out = []
            for _p, g in rec.get('senses') or []:
                raw = cc.convert(g)
                raw = re.sub(r'\[[^\]]*\]', '', raw)
                raw = re.sub(r'（[^）]*）|\([^)]*\)', '', raw)
                for bit in re.split(r'[,，、；;\n]', raw):
                    bit = re.sub(r'\s+', '', bit)
                    bit = re.sub(r'^(vt|vi|adj|adv|n|v|a)\.', '', bit)
                    if re.search(r'[\u4e00-\u9fff]', bit) and not re.search(r'人名|地名|\.\.\.|…', bit):
                        out.append(bit[:8])
            return out

        def stem_good(stem, need=1):
            if word in BLOCK:
                return None
            if not stem or stem == word or stem in HARD_FUNCTION or stem in SOFT_FUNCTION:
                return None
            if len(stem) < 3 or stem not in cmu or stem not in records:
                return None
            if (records[stem].get('frq') or 0) <= 0 and stem not in src_map:
                return None
            best, nbest = '', 0
            for tz in sense_bits(stem):
                n = len(set(cjk_key(tz)) & set(cjk_key(zh)))
                if n > nbest:
                    best, nbest = tz, n
            if nbest < need:
                return None
            return best

        found = []

        def add(parts):
            if len(parts) >= 2:
                found.append(parts)

        # suffix, optionally with a transparent prefix
        for ending, form, szh, sid in ALGO_SUF:
            if not word.endswith(ending) or len(word) <= len(ending) + 2:
                continue
            if sid == '-ly' and pos != 'adv.':
                continue
            if sid in {'-er', '-or'}:
                if pos not in {'n.', ''}:
                    continue
                if not re.search(r'[人者員師家工]', zh or ''):
                    continue
            stem0 = word[:-len(ending)]
            cands = [stem0]
            if stem0.endswith('i') and len(stem0) > 2:
                cands.append(stem0[:-1] + 'y')
            if not stem0.endswith('e'):
                cands.append(stem0 + 'e')
            if len(stem0) >= 3 and stem0[-1] == stem0[-2] and stem0[-1] not in 'aeiou':
                cands.append(stem0[:-1])
            for stem in cands:
                sz = stem_good(stem)
                if not sz and sid in {'-er', '-or'}:
                    rec = records.get(stem) or {}
                    is_verb = any(p == 'v.' for p, _g in (rec.get('senses') or []))
                    bits = sense_bits(stem)
                    if is_verb and bits and re.search(r'[人者員師家工]', zh or ''):
                        sz = bits[0]
                if not sz:
                    # prefix + this stem
                    for rest, pre in strip_prefix(stem, SAFE_PREFIX):
                        rz = stem_good(rest)
                        if not rz:
                            continue
                        if sid == '-ly' and pos != 'adv.':
                            continue
                        add([
                            ('prefix', pre[2], pre[0], pre[1]),
                            ('stem', rest, rest, rz),
                            ('suffix', sid, form, szh),
                        ])
                    continue
                add([
                    ('stem', stem, stem, sz),
                    ('suffix', sid, form, szh),
                ])

        for rest, pre in strip_prefix(word, SAFE_PREFIX):
            rz = stem_good(rest)
            if not rz:
                continue
            # un-/dis-/non- may be 不 + stem even when the only shared idea is the stem gloss
            add([
                ('prefix', pre[2], pre[0], pre[1]),
                ('stem', rest, rest, rz),
            ])

        if not found:
            return None

        def score(parts):
            stem = next(p for p in parts if p[0] in {'stem', 'root'})
            frq = (records.get(stem[2]) or {}).get('frq') or 999999
            # prefer a real free word, then the more common stem, then fewer parts
            return (1 if stem[0] == 'stem' else 0, -frq, -len(parts), len(stem[2]))

        best = max(found, key=score)
        return pack_morph(best, zh)

    words_out = []
    missing_kk = []
    for lem, srcs in src_map.items():
        if lem in HARD_FUNCTION:
            continue
        if lem in names:
            continue
        srcs = sorted(srcs, key=lambda s: (-s['y'], s['n'], s['id']))
        # dedupe identical ids
        dedup = []
        seen = set()
        for s in srcs:
            if s['id'] in seen:
                continue
            seen.add(s['id'])
            dedup.append(s)
        if lem in GLOSS_FIX:
            pos, zh = GLOSS_FIX[lem]
        else:
            pos, dict_zh = primary_gloss(records.get(lem), cc)
            zh = re.sub(r'[\s\\]+', '', dict_zh or '')
            zh = re.sub(r'(vt|vi|adj|adv|prep|conj|pron|pl|n|v|a)\.', '', zh)
        if not zh or lem not in cmu:
            continue
        if re.search(r'人名|地名|花蓮|等於|等于', zh):
            continue
        if lem in SOFT_FUNCTION and lem not in TEACH_FUNCTION:
            continue
        if not pos:
            pos = ''
        syl, stress, sec, kk = pronounce(lem)
        morph = decompose(lem, zh, pos) if zh else None
        ovr = (overrides.get('words') or {}).get(lem) or {}
        if 'syl' in ovr:
            syl = ovr['syl']
        if 'stress' in ovr:
            stress = ovr['stress']
        if 'sec' in ovr:
            sec = ovr['sec']
        if 'kk' in ovr:
            kk = ovr['kk']
        if 'zh' in ovr:
            zh = ovr['zh']
        if 'pos' in ovr:
            pos = ovr['pos']
        if 'morph' in ovr:
            morph = ovr['morph']
        if not kk:
            missing_kk.append(lem)
        if morph and not morph.get('ok', True):
            morph = None
        words_out.append({
            'id': 'enw:' + lem,
            'w': lem,
            'pos': pos or '',
            'zh': zh,
            'kk': kk,
            'syl': syl,
            'stress': stress if kk else 0,
            'sec': sec,
            'count': len(dedup),
            'src': dedup,
            'morph': morph,
        })

    words_out.sort(key=lambda w: w['w'])

    # affix index
    affix_acc = {}

    def add_affix(kind, ident, form, zh, word_id):
        slot = affix_acc.setdefault(ident, {'id': ident, 'kind': kind, 'form': form, 'zh': zh, 'words': []})
        if word_id not in slot['words']:
            slot['words'].append(word_id)
        if zh and not slot['zh']:
            slot['zh'] = zh

    by_id = {w['id']: w for w in words_out}
    for w in words_out:
        m = w.get('morph')
        if not m:
            continue
        for p in m.get('parts') or []:
            form = p['f']
            if p['k'] == 'prefix':
                form = p['f'] if p['f'].endswith('-') else p['f'] + '-'
            elif p['k'] == 'suffix':
                form = p['f'] if str(p['f']).startswith('-') else '-' + p['f']
            elif p['k'] == 'root':
                form = p['f']
            else:
                form = p['f']
            add_affix(
                'prefix' if p['k'] == 'prefix' else ('suffix' if p['k'] == 'suffix' else 'root'),
                p['id'], form, p['zh'], w['id'],
            )
        # also file the word under its root id even if the displayed stem is a free word
        # that itself decomposes — walk one level
        root = m.get('root')
        if root and root.startswith('enw:'):
            pass
        stem_word = None
        for p in m.get('parts') or []:
            if p['k'] == 'stem':
                stem_word = p['f']
        if stem_word:
            stem_entry = by_id.get('enw:' + stem_word)
            if stem_entry and stem_entry.get('morph') and stem_entry['morph'].get('root'):
                rid = stem_entry['morph']['root']
                # find zh from the stem's root part
                rzh, rform = '', rid
                for p in stem_entry['morph'].get('parts') or []:
                    if p['id'] == rid:
                        rzh, rform = p['zh'], p['f']
                add_affix('root', rid, rform, rzh, w['id'])

    affixes = sorted(affix_acc.values(), key=lambda a: ({'prefix': 0, 'root': 1, 'suffix': 2}[a['kind']], a['form']))

    phrase_out = []
    for norm, slot in phrases.items():
        src = sorted(slot['src'], key=lambda s: (-s['y'], s['n']))
        dedup, seen = [], set()
        for s in src:
            if s['id'] in seen:
                continue
            seen.add(s['id'])
            dedup.append(s)
        if not dedup:
            # listed but never matched in text — still keep with empty? skip
            # The listing question should have matched. If not, keep a synthetic
            # source-less phrase out.
            continue
        ovr = (overrides.get('phrases') or {}).get(norm) or {}
        zh = ovr.get('zh', slot['zh'])
        phrase_out.append({
            'id': 'enp:' + norm.replace(' ', '-'),
            'w': norm,
            'zh': zh,
            'count': len(dedup),
            'src': dedup,
        })
    phrase_out.sort(key=lambda p: p['w'])

    # sanity checks
    by_w = {w['w']: w for w in words_out}
    checks = [
        ('comfortable', ['com', 'fort', 'a', 'ble'], 0, 'ˈkʌm'),
        ('collect', ['col', 'lect'], 1, 'ˈlɛkt'),
        ('beautiful', ['beau', 'ti', 'ful'], 0, 'ˈbju'),
        ('environment', ['en', 'vi', 'ron', 'ment'], 1, 'ˈvaɪ'),
        ('creation', ['cre', 'a', 'tion'], 1, 'ˈe'),
        ('respond', ['re', 'spond'], 1, 'ˈspɑnd'),
        ('different', ['dif', 'fer', 'ent'], 0, 'ˈdɪf'),
    ]
    failed = False
    for w, syl, stress, kk_has in checks:
        item = by_w.get(w)
        if not item:
            print('MISSING check word', w, file=sys.stderr)
            failed = True
            continue
        if syl is not None and item['syl'] != syl:
            print(f'SYL {w}: {item["syl"]} != {syl}', file=sys.stderr)
            failed = True
        if stress is not None and item['stress'] != stress:
            print(f'STRESS {w}: {item["stress"]} != {stress} kk={item["kk"]}', file=sys.stderr)
            failed = True
        if kk_has and kk_has not in (item['kk'] or ''):
            print(f'KK {w}: {item["kk"]} lacks {kk_has}', file=sys.stderr)
            failed = True
    if failed:
        sys.exit(2)

    years = sorted({q['y'] for q in qmeta if q['y']})
    payload = {
        'meta': {
            'version': 1,
            'source': 'data/en/quiz.json',
            'years': years,
            'wordCount': len(words_out),
            'phraseCount': len(phrase_out),
            'note': '由考古題題幹、選項、文章與詳解裡的單字／片語整理。功能詞與專名已排除，屈折形併回原形。KK 為美式，分音採字典音節。構詞只在字首、字根、字尾確實對得上時才拆。',
        },
        'words': words_out,
        'phrases': phrase_out,
        'affixes': affixes,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    OUT_JS.write_text('window.__EN_VOCAB__ = ' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')

    decomposed = [w for w in words_out if w.get('morph')]
    print(f'words {len(words_out)} phrases {len(phrase_out)} decomposed {len(decomposed)} missing_kk {len(missing_kk)} affixes {len(affixes)}')
    if missing_kk[:30]:
        print('no kk sample', ', '.join(missing_kk[:30]))
    review = CACHE / 'morph-review.txt'
    lines = []
    for w in decomposed:
        lines.append(f"{w['w']}\t{w['zh']}\t{w['morph']['formula']}")
    review.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('review', review)


if __name__ == '__main__':
    main()
