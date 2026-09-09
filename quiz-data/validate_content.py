"""Standard-library checks: python validate_content.py (from any directory)."""
from pathlib import Path
import json,collections,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parent
def read(name):return json.loads((ROOT/name).read_text(encoding='utf-8'))
data=read('question_bank.json');qs=data['questions'];groups=data['groups'];gm={g['id']:g for g in groups}
assets=read('asset_manifest.json')['assets'];am={a['id']:a for a in assets}
assert len(qs)==180 and len({q['id'] for q in qs})==180
assert len(gm)==len(groups)==18 and len(am)==len(assets)==32
expected={'L1':10,'L2':10,'L3':10,'L4':5,'R1':5,'R2':5,'R3':5,'R4':10}
for mock in read('mock_manifest.json')['mocks']:
 selected=[q for q in qs if q['mock_id']==mock['id']]
 assert collections.Counter(q['part'] for q in selected)==expected
 assert [q['number'] for q in selected]==list(range(1,61))
 assert mock['question_ids']==[q['id'] for q in selected]
for a in assets:
 p=ROOT/a['file'];assert p.is_file();ET.parse(p)
for q in qs:
 assert q['origin']=='original' and q['explanation_ja'] and q['tags']
 assert q['section']==('listening' if q['number']<=35 else 'reading')
 if q.get('asset_id'):assert q['asset_id'] in am
 if q['type'] in ['image_true_false','text_true_false']:assert q['answer'] in ['T','F']
 else:
  opts=gm[q['group_id']]['options'] if 'group_id' in q else q['options']
  assert q['answer'] in [o['id'] for o in opts]
 if q['part'].startswith('L'):
  a=q['audio'];assert a['repeat_count']==2 and a['file'] is None
  turns=a['turns'];n=len(turns)
  assert (q['part']=='L1' and n==1) or (q['part']=='L2' and n==2) or (q['part']=='L3' and n==3) or (q['part']=='L4' and n in [5,6])
  for t in turns:assert t['text']['zh'] and t['text']['pinyin']
  if q['part'] in ['L3','L4']:assert len(q['options'])==3 and turns[-1]['speaker']=='narrator' and turns[-1]['text']['zh'].endswith('？')
 if q['part']=='R2':assert q['prompt']['zh'].count('（　）')==1
 if q['part']=='R3':assert q['statement']['zh'] and q['statement']['pinyin']
 if q['section']=='reading':assert q['prompt']['zh'] and q['prompt']['pinyin']
for g in groups:
 opts=g['options'];members=[q for q in qs if q.get('group_id')==g['id']]
 assert len(members)==5
 assert len(opts)==(6 if g['example'] else 5)
 assert len({o['id'] for o in opts})==len(opts)
 assert len({o.get('asset_id',o.get('text',{}).get('zh')) for o in opts})==len(opts)
 for o in opts:
  if 'asset_id' in o:assert o['asset_id'] in am
  else:assert o['text']['zh'] and o['text']['pinyin']
 answers=[q['answer'] for q in members]
 assert len(set(answers))==5
 if g['example']:
  assert g['example']['answer'] not in answers
  assert g['example']['answer'] in [o['id'] for o in opts]
for p in read('official_papers.json')['papers']:
 assert len(p['answer_key'])==60
 for i in range(1,61):
  value=p['answer_key'][str(i)]
  assert value in (['T','F'] if i<=10 or 46<=i<=50 else list('ABC') if 21<=i<=35 else list('ABCDEF'))
 assert p['answer_key_source_pdf_page_1based']==18
def score(l,r):return round(100*l/35+100*r/25,1)
assert score(35,25)==200.0 and score(21,15)==120.0 and score(0,0)==0.0 and score(25,18)==143.4
assert len({json.dumps((q['prompt']['zh'],q.get('statement',{}).get('zh'),[t['text']['zh'] for t in q.get('audio',{}).get('turns',[])]),ensure_ascii=False) for q in qs})==180
tagids={t['id'] for t in read('tag_index.json')['tags']}
assert all(set(q['tags'])<=tagids for q in qs)
for e in read('part_examples.json')['examples']:
 assert e['part'] in ['L1','L3','L4','R3']
 if 'asset_id' in e:assert e['asset_id'] in am
 if 'audio_zh' in e:assert len(e['audio_zh'])==len(e['speakers'])
checks={'status':'PASS','original_questions':180,'listening_scripts':105,'reading_questions':75,'groups':18,'svg_assets':32,'official_answer_keys':120,'mc_answer_distribution':dict(collections.Counter(q['answer'] for q in qs if q['type']=='audio_mc')),'part_counts':dict(collections.Counter(q['part'] for q in qs)),'not_tested':['Recorded audio (not included)','Browser/app integration','Full official audio timing','Independent native-speaker review','Empirical difficulty calibration','Complete 300-word lexical compliance']}
print(json.dumps(checks,ensure_ascii=True,indent=2))
