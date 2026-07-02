import { useEffect, useState } from 'react'
import { api } from '../api'
import { GOODS_CATEGORIES, formatYen } from '../util'
import { Card, Modal, Field, inputClass, OshiSelect, PrimaryButton, Empty } from '../components/ui'

const emptyForm = { name: '', category: 'アクスタ', price: '', oshi_id: null, image: '', memo: '' }

// グッズコレクション管理（画像付き・カテゴリ分け）
export default function Goods() {
  const [list, setList] = useState([])
  const [oshiList, setOshiList] = useState([])
  const [filter, setFilter] = useState('すべて')
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')

  const reload = () => api('/goods').then(setList).catch(console.error)
  useEffect(() => { reload(); api('/oshi').then(setOshiList).catch(console.error) }, [])

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('画像は2MB以下にしてください'); return }
    const reader = new FileReader()
    reader.onload = () => setForm((f) => ({ ...f, image: reader.result }))
    reader.readAsDataURL(file)
  }
  const save = async (e) => {
    e.preventDefault(); setError('')
    try { await api('/goods', { method: 'POST', body: form }); setForm(null); reload() }
    catch (err) { setError(err.message) }
  }
  const remove = async (g) => {
    if (!confirm(`「${g.name}」を削除しますか？`)) return
    await api(`/goods/${g.id}`, { method: 'DELETE' }); reload()
  }

  const filtered = filter === 'すべて' ? list : list.filter((g) => g.category === filter)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-wine">グッズコレクション</h2>
        <PrimaryButton onClick={() => setForm({ ...emptyForm })}>＋ 追加</PrimaryButton>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {['すべて', ...GOODS_CATEGORIES].map((c) => (
          <button key={c}
            className={`text-xs rounded-full px-3 py-1.5 border shrink-0 ${filter === c ? 'bg-wine text-white border-wine' : 'bg-paper-card border-paper-line text-ink-soft'}`}
            onClick={() => setFilter(c)}>{c}</button>
        ))}
      </div>

      {filtered.length === 0 && <Card><Empty icon="🎁" message={'グッズがまだありません。\nアクスタやCDを登録してコレクションを作りましょう！'} /></Card>}

      <div className="grid grid-cols-2 gap-3">
        {filtered.map((g) => (
          <div key={g.id} className="polaroid rounded-sm">
            <div className="aspect-square rounded-sm overflow-hidden">
              {g.image ? <img src={g.image} alt={g.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-paper flex items-center justify-center text-4xl opacity-50">🎁</div>}
            </div>
            <div className="px-1 pt-1.5">
              <p className="font-bold text-sm truncate">{g.name}</p>
              <p className="text-[11px] text-ink-soft truncate">{g.category}{g.oshi_name ? `・${g.oshi_name}` : ''}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs font-bold text-wine">{g.price != null ? formatYen(g.price) : ''}</span>
                <button onClick={() => remove(g)} className="text-ink-soft/50 text-sm px-1">×</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {form && (
        <Modal title="グッズを追加" onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <Field label="グッズ名 *">
              <input className={inputClass} value={form.name} maxLength={50}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：アクリルスタンド 2026ver." />
            </Field>
            <Field label="カテゴリ">
              <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {GOODS_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="価格（円・任意）">
              <input type="number" min="0" className={inputClass} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="例：1800" />
            </Field>
            <Field label="推し">
              <OshiSelect oshiList={oshiList} value={form.oshi_id} onChange={(v) => setForm({ ...form, oshi_id: v })} />
            </Field>
            <Field label="画像（任意・2MBまで）">
              <input type="file" accept="image/*" onChange={handleFile} className="text-xs" />
            </Field>
            {form.image && (
              <div className="flex items-center gap-3 mb-3">
                <img src={form.image} alt="プレビュー" className="w-16 h-16 rounded-lg object-cover" />
                <button type="button" className="text-xs text-ink-soft underline" onClick={() => setForm({ ...form, image: '' })}>画像を外す</button>
              </div>
            )}
            <Field label="メモ">
              <input className={inputClass} value={form.memo} maxLength={100} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="例：ガチャで3回目に出た" />
            </Field>
            {error && <p className="text-wine text-xs mb-2">{error}</p>}
            <PrimaryButton className="w-full" disabled={!form.name.trim()}>追加する</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  )
}
