import { useEffect, useState } from 'react'
import { api } from '../api'
import { OSHI_CATEGORIES, OSHI_COLORS } from '../util'
import { Card, Modal, Field, inputClass, OshiAvatar, PrimaryButton, Empty } from '../components/ui'

const emptyForm = { name: '', category: 'アイドル', color: '#ec4899', image: '' }

// 推しの登録・一覧・編集・削除
export default function Oshi() {
  const [list, setList] = useState([])
  const [form, setForm] = useState(null) // nullなら閉じる / {id有り}なら編集
  const [error, setError] = useState('')

  const reload = () => api('/oshi').then(setList).catch(console.error)
  useEffect(() => { reload() }, [])

  // 画像ファイルをBase64(dataURL)にしてフォームに入れる
  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      alert('画像は2MB以下にしてください')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setForm((f) => ({ ...f, image: reader.result }))
    reader.readAsDataURL(file)
  }

  const save = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (form.id) {
        await api(`/oshi/${form.id}`, { method: 'PUT', body: form })
      } else {
        await api('/oshi', { method: 'POST', body: form })
      }
      setForm(null)
      reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const remove = async (o) => {
    if (!confirm(`「${o.name}」を削除しますか？\n（予定や記録は残ります）`)) return
    await api(`/oshi/${o.id}`, { method: 'DELETE' })
    reload()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">推しの管理</h2>
        <PrimaryButton onClick={() => setForm({ ...emptyForm })}>＋ 推しを登録</PrimaryButton>
      </div>

      {list.length === 0 && (
        <Card>
          <Empty icon="💖" message={'まだ推しが登録されていません。\nまずは推しを登録しましょう！'} />
        </Card>
      )}

      {list.map((o) => (
        <Card key={o.id} className="flex items-center gap-3">
          <OshiAvatar oshi={o} size="w-14 h-14" textSize="text-xl" />
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">{o.name}</p>
            <span
              className="inline-block text-[11px] text-white rounded-full px-2 py-0.5 mt-1"
              style={{ backgroundColor: o.color }}
            >
              {o.category}
            </span>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button onClick={() => setForm({ ...o, image: o.image || '' })} className="text-xs text-pink-500 border border-pink-200 rounded-lg px-3 py-1">編集</button>
            <button onClick={() => remove(o)} className="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-1">削除</button>
          </div>
        </Card>
      ))}

      {form && (
        <Modal title={form.id ? '推しを編集' : '推しを登録'} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <Field label="名前 *">
              <input className={inputClass} value={form.name} maxLength={30}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：星野アイ" />
            </Field>
            <Field label="カテゴリ">
              <select className={inputClass} value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {OSHI_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="推しカラー">
              <div className="flex gap-2 flex-wrap">
                {OSHI_COLORS.map((c) => (
                  <button type="button" key={c}
                    className={`w-8 h-8 rounded-full ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-500' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setForm({ ...form, color: c })} />
                ))}
              </div>
            </Field>
            <Field label="画像（任意・2MBまで）">
              <input type="file" accept="image/*" onChange={handleFile} className="text-xs" />
            </Field>
            {form.image && (
              <div className="flex items-center gap-3 mb-3">
                <img src={form.image} alt="プレビュー" className="w-16 h-16 rounded-full object-cover" />
                <button type="button" className="text-xs text-gray-400 underline"
                  onClick={() => setForm({ ...form, image: '' })}>画像を外す</button>
              </div>
            )}
            {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
            <PrimaryButton className="w-full" disabled={!form.name.trim()}>保存する</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  )
}
