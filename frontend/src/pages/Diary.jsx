import { useEffect, useState } from 'react'
import { api } from '../api'
import { VISIBILITIES, VISIBILITY_MAP, formatDateJa, todayStr } from '../util'
import { Card, Modal, Field, inputClass, OshiSelect, PrimaryButton, Empty, Avatar, Loading } from '../components/ui'

const emptyForm = { entry_date: '', title: '', content: '', oshi_id: null, related_event_id: null, visibility: 'private' }

// 日記帳：紙の手帳をめくるように過去の日記を読む個人の手帳（つぶやきとは別物）
export default function Diary() {
  const [tab, setTab] = useState('mine') // mine | feed
  const [entries, setEntries] = useState([])
  const [feed, setFeed] = useState([])
  const [oshiList, setOshiList] = useState([])
  const [joinedEvents, setJoinedEvents] = useState([])
  const [page, setPage] = useState(0) // 手帳のめくりページ
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [feedLoading, setFeedLoading] = useState(true)

  const reload = () => api('/diary').then((e) => { setEntries(e); setPage((p) => Math.min(p, Math.max(0, e.length - 1))) }).catch(console.error).finally(() => setLoading(false))
  useEffect(() => {
    reload()
    api('/diary/feed').then(setFeed).catch(console.error).finally(() => setFeedLoading(false))
    api('/oshi').then(setOshiList).catch(console.error)
    api('/events').then((evs) => setJoinedEvents(evs.filter((e) => e.joined))).catch(console.error)
  }, [])

  const save = async (e) => {
    e.preventDefault(); setError('')
    try {
      const body = {
        entry_date: form.entry_date, title: form.title || null, content: form.content,
        oshi_id: form.oshi_id, related_event_id: form.related_event_id, visibility: form.visibility,
        // 「同じイベント参加者」公開のときは、紐づけたイベントを公開判定にも使う
        event_id: form.visibility === 'public_same_event' ? form.related_event_id : null,
      }
      if (form.id) await api(`/diary/${form.id}`, { method: 'PUT', body })
      else await api('/diary', { method: 'POST', body })
      setForm(null); reload()
      api('/diary/feed').then(setFeed).catch(() => {})
    } catch (err) { setError(err.message) }
  }

  const remove = async (d) => {
    if (!confirm('この日記を削除しますか？')) return
    await api(`/diary/${d.id}`, { method: 'DELETE' }); reload()
  }

  const openNew = () => setForm({ ...emptyForm, entry_date: todayStr() })
  const openEdit = (d) => setForm({
    id: d.id, entry_date: d.entry_date, title: d.title || '', content: d.content,
    oshi_id: d.oshi_id, related_event_id: d.related_event_id, visibility: d.visibility,
  })

  const cur = entries[page]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-wine">日記帳</h2>
        <PrimaryButton onClick={openNew}>✏️ 書く</PrimaryButton>
      </div>

      <div className="grid grid-cols-2 bg-paper rounded-xl p-1 text-sm font-bold">
        <button className={`rounded-lg py-1.5 ${tab === 'mine' ? 'bg-wine text-white' : 'text-ink-soft'}`} onClick={() => setTab('mine')}>📔 わたしの手帳</button>
        <button className={`rounded-lg py-1.5 ${tab === 'feed' ? 'bg-wine text-white' : 'text-ink-soft'}`} onClick={() => setTab('feed')}>🌏 みんなの日記</button>
      </div>

      {/* わたしの手帳（ページめくりUI） */}
      {tab === 'mine' && (
        loading ? (
          <Loading label="日記を読み込み中…" />
        ) : entries.length === 0 ? (
          <Card><Empty icon="📔" message={'まだ日記がありません。\n今日の推し活を書き残しましょう。'} /></Card>
        ) : (
          <>
            {/* 手帳ページ */}
            <div className="diary-page rounded-2xl p-5 min-h-[300px] relative">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-wine font-bold">{formatDateJa(cur.entry_date)}</p>
                <span className="text-[10px] bg-paper text-ink-soft rounded-full px-2 py-0.5">
                  {VISIBILITY_MAP[cur.visibility]?.icon} {VISIBILITY_MAP[cur.visibility]?.label}
                </span>
              </div>
              {cur.title && <p className="font-bold text-lg text-ink mb-2">{cur.title}</p>}
              <p className="text-sm text-ink whitespace-pre-wrap break-words leading-7">{cur.content}</p>
              <div className="flex flex-wrap gap-1 mt-3">
                {cur.oshi_name && <span className="text-[10px] text-white rounded-full px-2 py-0.5" style={{ backgroundColor: cur.oshi_color || '#c8b7a0' }}>{cur.oshi_name}</span>}
                {cur.related_event_name && <span className="text-[10px] bg-wine/15 text-wine rounded-full px-2 py-0.5">🎪 {cur.related_event_name}</span>}
              </div>
              <div className="flex gap-3 mt-4 pt-3 border-t border-paper-line/60">
                <button onClick={() => openEdit(cur)} className="text-[11px] text-wine underline">編集</button>
                <button onClick={() => remove(cur)} className="text-[11px] text-ink-soft underline">削除</button>
              </div>
            </div>
            {/* めくり操作 */}
            <div className="flex items-center justify-between">
              <button onClick={() => setPage((p) => Math.min(entries.length - 1, p + 1))} disabled={page >= entries.length - 1}
                className="text-wine text-sm disabled:opacity-30">‹ 前の日記</button>
              <span className="text-[11px] text-ink-soft">{page + 1} / {entries.length} ページ</span>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0}
                className="text-wine text-sm disabled:opacity-30">次の日記 ›</button>
            </div>
          </>
        )
      )}

      {/* みんなの日記（公開範囲はサーバー側で判定済み） */}
      {tab === 'feed' && (
        <>
          {feedLoading && <Loading label="日記を読み込み中…" />}
          {!feedLoading && feed.length === 0 && <Card><Empty icon="🌏" message={'公開されている日記はまだありません。'} /></Card>}
          {feed.map((d) => (
            <Card key={d.id}>
              <div className="flex items-center gap-2">
                <Avatar image={d.author_avatar} name={d.author_name} size="w-8 h-8" textSize="text-sm" />
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{d.author_name}{d.is_own && <span className="text-[10px] text-wine ml-1">(自分)</span>}</p>
                  <p className="text-[10px] text-ink-soft">{formatDateJa(d.entry_date)}</p>
                </div>
                <span className="ml-auto text-[10px] bg-paper text-ink-soft rounded-full px-2 py-0.5">{VISIBILITY_MAP[d.visibility]?.icon} {VISIBILITY_MAP[d.visibility]?.label}</span>
              </div>
              {d.title && <p className="font-bold text-sm mt-2">{d.title}</p>}
              <p className="text-sm mt-1 whitespace-pre-wrap break-words line-clamp-6">{d.content}</p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {d.oshi_name && <span className="text-[10px] text-white rounded-full px-2 py-0.5" style={{ backgroundColor: d.oshi_color || '#c8b7a0' }}>{d.oshi_name}</span>}
                {d.event_name && <span className="text-[10px] bg-wine/15 text-wine rounded-full px-2 py-0.5">🎪 {d.event_name}</span>}
              </div>
            </Card>
          ))}
        </>
      )}

      {/* 日記の作成・編集 */}
      {form && (
        <Modal title={form.id ? '日記を編集' : '日記を書く'} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <Field label="日付 *">
              <input type="date" className={inputClass} value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
            </Field>
            <Field label="タイトル（任意）">
              <input className={inputClass} value={form.title} maxLength={60} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例：初めての現場" />
            </Field>
            <Field label="本文 *">
              <textarea className={inputClass + ' resize-none'} rows={6} value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="今日の推し活を自由に書き残そう…" />
            </Field>
            <Field label="推し（任意）">
              <OshiSelect oshiList={oshiList} value={form.oshi_id} onChange={(v) => setForm({ ...form, oshi_id: v })} />
            </Field>
            <Field label="思い出のイベント（任意）">
              <select className={inputClass} value={form.related_event_id ?? ''}
                onChange={(e) => setForm({ ...form, related_event_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">紐づけない</option>
                {joinedEvents.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </Field>

            {/* 公開範囲（つぶやきと共通の4段階） */}
            <div className="mb-3">
              <p className="text-sm font-medium text-ink-soft mb-1">公開範囲</p>
              <div className="grid grid-cols-2 gap-1.5">
                {VISIBILITIES.map((v) => (
                  <button type="button" key={v.key} onClick={() => setForm({ ...form, visibility: v.key })}
                    className={`text-xs rounded-lg px-2 py-1.5 border text-left ${form.visibility === v.key ? 'bg-wine text-white border-wine' : 'border-paper-line text-ink-soft bg-paper-card'}`}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
              {form.visibility === 'public_same_event' && !form.related_event_id && (
                <p className="text-[10px] text-wine mt-1">「同じイベント参加者」に公開するには、思い出のイベントを選んでください。</p>
              )}
              {form.visibility === 'public_same_oshi' && !form.oshi_id && (
                <p className="text-[10px] text-wine mt-1">「同じ推しの人」に公開するには、推しを選んでください。</p>
              )}
            </div>

            {error && <p className="text-wine text-xs mb-2">{error}</p>}
            <PrimaryButton className="w-full" disabled={!form.content.trim() || !form.entry_date}>{form.id ? '更新する' : '保存する'}</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  )
}
