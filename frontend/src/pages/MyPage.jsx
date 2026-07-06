import { useNavigate } from 'react-router-dom'
import { Card, Avatar } from '../components/ui'

// マイページ：第9弾でボトムナビから外した個人向け機能への導線を1か所に集約するハブ。
// 機能自体はそれぞれの既存画面のまま（ここは導線のみ）。
export default function MyPage({ user }) {
  const nav = useNavigate()

  const items = [
    { icon: '👤', label: 'プロフィール設定', desc: '表示名・アイコン・自己紹介・通知・テーマ', to: '/profile' },
    { icon: '✍️', label: 'つぶやき', desc: 'みんなのつぶやきを見る・投稿する', to: '/posts' },
    { icon: '📔', label: '日記帳', desc: 'オタ活日記の記録・ふりかえり', to: '/diary' },
    { icon: '🐷', label: '貯金目標一覧・AI相談', desc: 'イベントごとの貯金と貯金サポートAI', to: '/savings' },
    { icon: '🛍', label: 'グッズ', desc: 'グッズコレクションの管理', to: '/goods' },
    { icon: '🎫', label: '参戦記録・家計簿', desc: '支出の記録と集計グラフ', to: '/records' },
    { icon: '🕘', label: 'イベント履歴', desc: '参加したイベントのふりかえり', to: '/history' },
    { icon: '🔒', label: 'アカウント公開設定', desc: '公開／非公開の切り替え（プロフィール設定内）', to: '/profile' },
    { icon: '🚫', label: 'ブロックリスト', desc: 'ブロック中のユーザーの確認・解除', to: '/blocks' },
    { icon: '💬', label: 'サイト案内AI', desc: '推しログの使い方をAIに質問', to: '/guide' },
    ...(user.is_admin ? [{ icon: '🛠', label: '管理者画面', desc: 'イベント・推し・会場・審査の管理', to: '/admin' }] : []),
  ]

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-lg text-wine">マイページ</h2>

      {/* 自分のプロフィールの要約（タップで編集へ） */}
      <Card>
        <button onClick={() => nav('/profile')} className="w-full flex items-center gap-3 text-left">
          <Avatar image={user.avatar} name={user.display_name || user.username} size="w-14 h-14" textSize="text-xl" />
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">{user.display_name || user.username}</p>
            <p className="text-[11px] text-ink-soft truncate">{user.bio || 'プロフィールを編集する ›'}</p>
          </div>
          <span className="text-ink-soft">›</span>
        </button>
      </Card>

      {/* 機能への導線一覧 */}
      <Card className="p-2">
        <div className="divide-y divide-paper-line/60">
          {items.map((it) => (
            <button key={it.label} onClick={() => nav(it.to)}
              className="w-full flex items-center gap-3 px-2 py-3 text-left">
              <span className="text-xl w-7 text-center shrink-0">{it.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink">{it.label}</p>
                <p className="text-[10px] text-ink-soft truncate">{it.desc}</p>
              </div>
              <span className="text-ink-soft shrink-0">›</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
