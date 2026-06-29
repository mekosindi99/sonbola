import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  Handle, Position, type Connection, type Edge, type Node,
  Panel, BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Save, Plus, Trash2, CheckCircle2, Loader2, Settings2, Zap, Download, Upload } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ── Color map per node type ────────────────────────────────────────────────
const NODE_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  start:       { bg: '#166534', border: '#22c55e', text: '#dcfce7', icon: '🟢' },
  classify:    { bg: '#1e3a8a', border: '#60a5fa', text: '#dbeafe', icon: '🔵' },
  condition:   { bg: '#7c2d12', border: '#f97316', text: '#ffedd5', icon: '🔀' },
  ai_reply:    { bg: '#4a1d96', border: '#a78bfa', text: '#ede9fe', icon: '🤖' },
  saved_reply: { bg: '#134e4a', border: '#2dd4bf', text: '#ccfbf1', icon: '📝' },
  send_image:  { bg: '#831843', border: '#f472b6', text: '#fce7f3', icon: '🖼️' },
  handover:    { bg: '#7f1d1d', border: '#f87171', text: '#fee2e2', icon: '👤' },
  end:         { bg: '#1f2937', border: '#6b7280', text: '#f3f4f6', icon: '⏹️' },
};

const NODE_LABELS: Record<string, string> = {
  start:       'بداية الفلو',
  classify:    'تصنيف النية',
  condition:   'شرط / تحقق',
  ai_reply:    'رد ذكاء اصطناعي',
  saved_reply: 'رد محفوظ',
  send_image:  'إرسال صورة',
  handover:    'تحويل للأدمن',
  end:         'نهاية الفلو',
};

// ── Custom Node Component ─────────────────────────────────────────────────
function FlowNode({ data, selected }: { data: any; selected: boolean }) {
  const c = NODE_COLORS[data.type] || NODE_COLORS.end;
  const hasInput = data.type !== 'start';
  const hasOutput = data.type !== 'end';
  const isCondition = data.type === 'condition';

  return (
    <div
      style={{
        background: c.bg,
        border: `2px solid ${selected ? '#fff' : c.border}`,
        borderRadius: 12,
        minWidth: 180,
        maxWidth: 220,
        boxShadow: selected ? `0 0 0 3px ${c.border}55` : '0 4px 16px rgba(0,0,0,0.4)',
        transition: 'all 0.15s',
        fontFamily: 'sans-serif',
      }}
      dir="rtl"
    >
      {hasInput && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: c.border, border: '2px solid #fff', width: 10, height: 10 }}
        />
      )}

      {/* Header */}
      <div style={{ padding: '8px 12px 6px', borderBottom: `1px solid ${c.border}44` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>{c.icon}</span>
          <span style={{ color: c.text, fontWeight: 700, fontSize: 12 }}>{data.label || NODE_LABELS[data.type]}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '6px 12px 10px' }}>
        {data.type === 'classify' && (
          <div style={{ color: c.text, opacity: 0.85, fontSize: 11 }}>
            {(data.intents || ['طلب', 'سؤال منتج', 'شكوى', 'أخرى']).map((intent: string) => (
              <div key={intent} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <span style={{ color: c.border }}>▸</span> {intent}
              </div>
            ))}
          </div>
        )}
        {data.type === 'condition' && (
          <div style={{ color: c.text, opacity: 0.85, fontSize: 11 }}>
            <div style={{ marginBottom: 3, opacity: 0.7 }}>الكلمات المفتاحية:</div>
            {(data.keywords || []).slice(0, 3).map((kw: string) => (
              <span key={kw} style={{ background: c.border + '33', color: c.text, borderRadius: 4, padding: '1px 6px', marginLeft: 3, fontSize: 10 }}>{kw}</span>
            ))}
            {!data.keywords?.length && <span style={{ opacity: 0.5, fontSize: 10 }}>لم تحدد كلمات بعد</span>}
          </div>
        )}
        {data.type === 'ai_reply' && (
          <div style={{ color: c.text, opacity: 0.75, fontSize: 10, lineHeight: 1.4 }}>
            {data.prompt ? data.prompt.slice(0, 60) + (data.prompt.length > 60 ? '...' : '') : 'رد ذكي بناءً على المخزون والتعليمات'}
          </div>
        )}
        {data.type === 'saved_reply' && (
          <div style={{ color: c.text, opacity: 0.75, fontSize: 10 }}>يبحث في الردود المحفوظة أولاً</div>
        )}
        {data.type === 'send_image' && (
          <div style={{ color: c.text, opacity: 0.75, fontSize: 10 }}>
            {data.prompt
              ? data.prompt.split('\n')[0].slice(0, 55) + '...'
              : data.productCode ? `كود: ${data.productCode}` : 'يرسل صورة المنتج للزبون'}
          </div>
        )}
        {data.type === 'handover' && (
          <div style={{ color: c.text, opacity: 0.75, fontSize: 10 }}>
            {data.message ? data.message.slice(0, 55) + (data.message.length > 55 ? '...' : '') : 'يحول المحادثة للأدمن'}
          </div>
        )}
        {data.type === 'start' && (
          <div style={{ color: c.text, opacity: 0.75, fontSize: 10 }}>رسالة جديدة من الزبون</div>
        )}
        {data.type === 'end' && (
          <div style={{ color: c.text, opacity: 0.75, fontSize: 10 }}>
            {data.message ? data.message.split('\n')[0].slice(0, 55) + '...' : '⏹️ انتهى الفلو'}
          </div>
        )}
      </div>

      {/* Output handles */}
      {hasOutput && !isCondition && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: c.border, border: '2px solid #fff', width: 10, height: 10 }}
        />
      )}
      {isCondition && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="yes"
            style={{ background: '#22c55e', border: '2px solid #fff', width: 10, height: 10, left: '30%' }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="no"
            style={{ background: '#ef4444', border: '2px solid #fff', width: 10, height: 10, left: '70%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 24px', fontSize: 9, color: '#aaa' }}>
            <span style={{ color: '#22c55e' }}>✓ نعم</span>
            <span style={{ color: '#ef4444' }}>✗ لا</span>
          </div>
        </>
      )}
    </div>
  );
}

const nodeTypes = { flowNode: FlowNode };

// ── Node Palette Items ────────────────────────────────────────────────────
const PALETTE = [
  { type: 'start',       desc: 'نقطة دخول الرسائل' },
  { type: 'classify',    desc: 'يصنف نية الزبون بالذكاء الاصطناعي' },
  { type: 'condition',   desc: 'تحقق من كلمات أو شروط معينة' },
  { type: 'ai_reply',    desc: 'رد ذكي من GPT بناءً على المخزون' },
  { type: 'saved_reply', desc: 'يجيب من الردود المحفوظة' },
  { type: 'send_image',  desc: 'يرسل صورة المنتج للزبون' },
  { type: 'handover',    desc: 'يحول المحادثة للأدمن' },
  { type: 'end',         desc: 'نهاية الفلو' },
];

// ── Default template flow (Sonbola Full Flow) ─────────────────────────────
const DEFAULT_NODES: Node[] = [
  {
    id: 'n1', type: 'flowNode', position: { x: 380, y: 20 },
    data: { type: 'start', label: 'بداية — استقبال الرسالة' },
  },
  {
    id: 'n2', type: 'flowNode', position: { x: 380, y: 150 },
    data: {
      type: 'saved_reply', label: '① فلتر الردود المحفوظة',
      keywords: ['التوصيل', 'التبديل', 'الموقع', 'طريقة الحجز'],
    },
  },
  {
    id: 'n3', type: 'flowNode', position: { x: 720, y: 150 },
    data: { type: 'end', label: '⚡ إنهاء فوري (رد محفوظ)' },
  },
  {
    id: 'n4', type: 'flowNode', position: { x: 380, y: 310 },
    data: {
      type: 'classify', label: '② تصنيف النية',
      intents: ['استفسار عن موديل', 'نية حجز', 'مشكلة أو مرتجع'],
      systemPrompt: 'درجة الحرارة = 0. حدد هدف الزبونة بدقة من ثلاثة خيارات فقط.',
    },
  },
  {
    id: 'n5', type: 'flowNode', position: { x: 60, y: 490 },
    data: {
      type: 'send_image', label: '③ عرض الموديل',
      prompt: 'اسألي أولاً: "عيني تدللين، يا عمر تريدين؟"\nبعد رد الزبونة: افحصي المخزن ← أرسلي الصورة + السعر صريحاً (بدون رمز العملة).\nثم اسألي: "تحبين أحجز لج عيني؟"\nممنوع عرض السعر أو التوفر بدون معرفة العمر أولاً.',
    },
  },
  {
    id: 'n6', type: 'flowNode', position: { x: 380, y: 490 },
    data: {
      type: 'ai_reply', label: '④ جمع بيانات الطلب',
      prompt: 'أنت موظف مبيعات في متجر سنبلة. لغتك عراقية مهذبة (عيني، تدللين).\nاستخرجي رقم الهاتف (يجب أن يبدأ بـ 07 ويتكون من 11 رقماً) والمحافظة والمنطقة حرفياً من نص الزبونة.\nممنوع التخمين — إذا قالت "أربيل" سجلي "أربيل" بالضبط.\nإذا نقصت معلومة واحدة اطلبيها هي فقط ولا تكرري الرسالة كاملة.\nممنوع الهلوسة أو تخمين المحافظات. ممنوع إرسال روابط صفحات.',
      maxTokens: 150,
    },
  },
  {
    id: 'n7', type: 'flowNode', position: { x: 700, y: 490 },
    data: {
      type: 'handover', label: '⑤ تحويل للأدمن',
      message: 'تفضلي اختي كيف أقدر أساعدج؟ سأحول المحادثة لأحد مسؤولينا الآن.',
    },
  },
  {
    id: 'n8', type: 'flowNode', position: { x: 380, y: 680 },
    data: {
      type: 'condition', label: '⑥ حجز سابق موجود؟',
      keywords: ['أضيفي', 'قطعة ثانية', 'طلبيتي', 'نفس الطلب', 'زيدي'],
    },
  },
  {
    id: 'n9', type: 'flowNode', position: { x: 60, y: 860 },
    data: {
      type: 'ai_reply', label: '⑥ب إضافة للطلب التراكمي',
      prompt: 'اسألي: "أضيفها لطلبيتج المحجوزة؟"\nعند الموافقة: اجمعي (السعر القديم + الجديد + التوصيل الثابت).\nاعرضي الفاتورة عمودياً:\n• القطعة الأولى: ...\n• القطعة الثانية: ...\n• التوصيل: ...\n• المجموع: ...',
      maxTokens: 200,
    },
  },
  {
    id: 'n10', type: 'flowNode', position: { x: 380, y: 860 },
    data: {
      type: 'end', label: '⑦ تم الحجز — تلجرام + مسح الكاش',
      message: 'أرسلي إشعار تلجرام فوراً مع رابطي Business Suite وm.me.\nبعدها: امسحي الذاكرة المؤقتة (Purge Cache) لهذا الزبون حتى تبدأ الجلسة القادمة من الصفر.',
    },
  },
];

const DEFAULT_EDGES: Edge[] = [
  { id: 'e1',  source: 'n1',  target: 'n2',  animated: true,  label: 'أي رسالة',       style: { stroke: '#22c55e', strokeWidth: 2 } },
  { id: 'e2a', source: 'n2',  target: 'n3',                   label: '✓ تطابق كلمة',   style: { stroke: '#2dd4bf', strokeWidth: 2 } },
  { id: 'e2b', source: 'n2',  target: 'n4',  animated: true,  label: '✗ لا تطابق',     style: { stroke: '#60a5fa', strokeWidth: 2 } },
  { id: 'e3a', source: 'n4',  target: 'n5',                   label: 'استفسار موديل',  style: { stroke: '#f472b6', strokeWidth: 2 } },
  { id: 'e3b', source: 'n4',  target: 'n6',                   label: 'نية حجز',        style: { stroke: '#a78bfa', strokeWidth: 2 } },
  { id: 'e3c', source: 'n4',  target: 'n7',                   label: 'مشكلة/مرتجع',   style: { stroke: '#f87171', strokeWidth: 2 } },
  { id: 'e4',  source: 'n5',  target: 'n6',                   label: 'بعد عرض الموديل', style: { stroke: '#f472b6', strokeWidth: 2 } },
  { id: 'e5',  source: 'n6',  target: 'n8',  animated: true,  label: 'بيانات مكتملة', style: { stroke: '#a78bfa', strokeWidth: 2 } },
  { id: 'e6',  source: 'n7',  target: 'n10',                  label: 'إنهاء',          style: { stroke: '#f87171', strokeWidth: 2 } },
  { id: 'e7a', source: 'n8',  target: 'n9',  sourceHandle: 'yes', label: '✓ نعم',      style: { stroke: '#22c55e', strokeWidth: 2 } },
  { id: 'e7b', source: 'n8',  target: 'n10', sourceHandle: 'no',  label: '✗ لا',       style: { stroke: '#6b7280', strokeWidth: 2 } },
  { id: 'e8',  source: 'n9',  target: 'n10',                  label: 'تم الإضافة',    style: { stroke: '#6b7280', strokeWidth: 2 } },
];

// ── Properties Panel ──────────────────────────────────────────────────────
function PropertiesPanel({ node, onChange }: { node: Node | null; onChange: (id: string, data: any) => void }) {
  if (!node) return (
    <div style={{ color: '#6b7280', textAlign: 'center', paddingTop: 40, fontSize: 13 }} dir="rtl">
      <Settings2 style={{ margin: '0 auto 8px', opacity: 0.3, width: 32, height: 32 }} />
      <p>اختر بوكس لتعديل إعداداته</p>
    </div>
  );

  const c = NODE_COLORS[node.data.type as string] || NODE_COLORS.end;
  const d = node.data as any;

  const update = (key: string, val: any) => onChange(node.id, { ...d, [key]: val });

  return (
    <div dir="rtl" style={{ fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 12px', background: c.bg, borderRadius: 8, border: `1px solid ${c.border}` }}>
        <span style={{ fontSize: 18 }}>{c.icon}</span>
        <span style={{ color: c.text, fontWeight: 700 }}>{NODE_LABELS[d.type]}</span>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>اسم البوكس</label>
        <input
          value={d.label || ''}
          onChange={e => update('label', e.target.value)}
          style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px', color: '#f9fafb', fontSize: 12, boxSizing: 'border-box' }}
          placeholder={NODE_LABELS[d.type]}
        />
      </div>

      {d.type === 'classify' && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>فئات النية (سطر لكل فئة)</label>
          <textarea
            value={(d.intents || []).join('\n')}
            onChange={e => update('intents', e.target.value.split('\n').filter(Boolean))}
            rows={5}
            style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px', color: '#f9fafb', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
            placeholder={'طلب\nسؤال منتج\nشكوى\nأخرى'}
          />
        </div>
      )}

      {d.type === 'condition' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>الكلمات المفتاحية (فاصلة بين كل كلمة)</label>
            <input
              value={(d.keywords || []).join(', ')}
              onChange={e => update('keywords', e.target.value.split(',').map((k: string) => k.trim()).filter(Boolean))}
              style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px', color: '#f9fafb', fontSize: 12, boxSizing: 'border-box' }}
              placeholder="S3, كود, أرسلي, صورة"
            />
          </div>
          <div style={{ background: '#374151', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#9ca3af' }}>
            <div style={{ color: '#22c55e', marginBottom: 4 }}>✓ نعم: إذا وُجدت إحدى الكلمات في رسالة الزبون</div>
            <div style={{ color: '#ef4444' }}>✗ لا: إذا لم توجد أي منها</div>
          </div>
        </>
      )}

      {d.type === 'ai_reply' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>تعليمات خاصة (اختياري)</label>
            <textarea
              value={d.prompt || ''}
              onChange={e => update('prompt', e.target.value)}
              rows={6}
              style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px', color: '#f9fafb', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
              placeholder="أجيبي على سؤال الزبون من المخزون..."
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>الحد الأقصى للرد (كلمات)</label>
            <input
              type="number"
              value={d.maxTokens || 120}
              onChange={e => update('maxTokens', Number(e.target.value))}
              min={30} max={400}
              style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px', color: '#f9fafb', fontSize: 12, boxSizing: 'border-box' }}
            />
          </div>
        </>
      )}

      {d.type === 'send_image' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>كود المنتج (اتركه فارغاً لاستخراجه تلقائياً)</label>
            <input
              value={d.productCode || ''}
              onChange={e => update('productCode', e.target.value)}
              style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px', color: '#f9fafb', fontSize: 12, boxSizing: 'border-box' }}
              placeholder="S391"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>تعليمات الصندوق</label>
            <textarea
              value={d.prompt || ''}
              onChange={e => update('prompt', e.target.value)}
              rows={6}
              style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px', color: '#f9fafb', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
              placeholder={'اسألي أولاً: "عيني تدللين، يا عمر تريدين؟"\nبعد الرد: افحصي المخزن وأرسلي الصورة + السعر صريحاً.'}
            />
          </div>
        </>
      )}

      {d.type === 'handover' && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>رسالة التحويل للأدمن</label>
          <textarea
            value={d.message || ''}
            onChange={e => update('message', e.target.value)}
            rows={3}
            style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px', color: '#f9fafb', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
            placeholder="تفضلي اختي كيف أقدر أساعدج؟"
          />
        </div>
      )}

      {d.type === 'end' && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>إجراءات النهاية</label>
          <textarea
            value={d.message || ''}
            onChange={e => update('message', e.target.value)}
            rows={4}
            style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, padding: '6px 8px', color: '#f9fafb', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
            placeholder={'أرسلي إشعار تلجرام.\nامسحي الذاكرة المؤقتة للزبون.'}
          />
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function BotFlow() {
  const { language, isRtl } = useTranslation();
  const ar = language === 'ar';
  const [flows, setFlows] = useState<any[]>([]);
  const [activeFlowId, setActiveFlowId] = useState<number | null>(null);
  const [currentFlowId, setCurrentFlowId] = useState<number | null>(null);
  const [flowName, setFlowName] = useState('فلو جديد');
  const [nodes, setNodes, onNodesChange] = useNodesState(DEFAULT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT_EDGES);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activating, setActivating] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  useEffect(() => { loadFlows(); }, []);

  const loadFlows = async () => {
    const res = await fetch(`${BASE}/api/bot-flows`);
    const data = await res.json();
    setFlows(data);
    const active = data.find((f: any) => f.isActive);
    if (active) setActiveFlowId(active.id);
  };

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, animated: true, style: { stroke: '#a78bfa', strokeWidth: 2 } }, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const updateNodeData = (id: string, data: any) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data } : n));
    setSelectedNode(prev => prev?.id === id ? { ...prev, data } : prev);
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow');
    if (!type || !reactFlowInstance) return;
    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!bounds) return;
    const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    const newNode: Node = {
      id: `node-${Date.now()}`,
      type: 'flowNode',
      position,
      data: { type, label: NODE_LABELS[type] },
    };
    setNodes(nds => [...nds, newNode]);
  }, [reactFlowInstance, setNodes]);

  const deleteSelected = () => {
    if (!selectedNode) return;
    setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
    setEdges(eds => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  const newFlow = () => {
    setCurrentFlowId(null);
    setFlowName('فلو جديد');
    setNodes(DEFAULT_NODES);
    setEdges(DEFAULT_EDGES);
    setSelectedNode(null);
  };

  const loadFlow = (flow: any) => {
    setCurrentFlowId(flow.id);
    setFlowName(flow.name);
    try { setNodes(JSON.parse(flow.nodes)); } catch { setNodes(DEFAULT_NODES); }
    try { setEdges(JSON.parse(flow.edges)); } catch { setEdges(DEFAULT_EDGES); }
    setSelectedNode(null);
  };

  const saveFlow = async () => {
    setSaving(true);
    try {
      const body = { name: flowName, nodes: JSON.stringify(nodes), edges: JSON.stringify(edges) };
      let res;
      if (currentFlowId) {
        res = await fetch(`${BASE}/api/bot-flows/${currentFlowId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        res = await fetch(`${BASE}/api/bot-flows`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      const saved = await res.json();
      setCurrentFlowId(saved.id);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      loadFlows();
    } finally { setSaving(false); }
  };

  const activateFlow = async () => {
    if (!currentFlowId) { alert('احفظ الفلو أولاً'); return; }
    setActivating(true);
    try {
      await fetch(`${BASE}/api/bot-flows/${currentFlowId}/activate`, { method: 'POST' });
      setActiveFlowId(currentFlowId);
      loadFlows();
    } finally { setActivating(false); }
  };

  const deleteFlow = async (id: number) => {
    if (!confirm('حذف هذا الفلو؟')) return;
    await fetch(`${BASE}/api/bot-flows/${id}`, { method: 'DELETE' });
    if (currentFlowId === id) newFlow();
    loadFlows();
  };

  const exportFlow = () => {
    const data = { name: flowName, nodes, edges, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flow-${flowName.replace(/\s+/g, '-')}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFlowRef = useRef<HTMLInputElement>(null);

  const importFlow = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.nodes || !data.edges) { alert('ملف غير صالح'); return; }
        setCurrentFlowId(null);
        setFlowName(data.name ? `${data.name} (مستورد)` : 'فلو مستورد');
        setNodes(data.nodes);
        setEdges(data.edges);
        setSelectedNode(null);
      } catch { alert('خطأ في قراءة الملف'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', background: '#111827', borderRadius: 16, overflow: 'hidden', direction: isRtl ? 'rtl' : 'ltr' }}>

      {/* ── Left Panel: Palette + Flows ────────────────────────────────── */}
      <div style={{ width: 220, background: '#1f2937', borderLeft: '1px solid #374151', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        {/* Flow name */}
        <div style={{ padding: '12px 10px 0' }}>
          <input
            value={flowName}
            onChange={e => setFlowName(e.target.value)}
            style={{ width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: '7px 10px', color: '#f9fafb', fontSize: 13, fontWeight: 600, boxSizing: 'border-box' }}
            placeholder="اسم الفلو"
          />
        </div>

        {/* Action buttons */}
        <div style={{ padding: '8px 10px', display: 'flex', gap: 6 }}>
          <button onClick={saveFlow} disabled={saving} style={{ flex: 1, background: saved ? '#166534' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {saved ? (ar ? 'محفوظ' : 'Saved') : (ar ? 'حفظ' : 'Save')}
          </button>
          <button onClick={newFlow} style={{ background: '#374151', color: '#d1d5db', border: 'none', borderRadius: 8, padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}>
            <Plus size={14} />
          </button>
        </div>

        {/* Activate button */}
        <div style={{ padding: '0 10px 8px' }}>
          <button
            onClick={activateFlow}
            disabled={activating || !currentFlowId}
            style={{ width: '100%', background: currentFlowId && activeFlowId === currentFlowId ? '#166534' : '#065f46', color: '#d1fae5', border: `1px solid ${currentFlowId && activeFlowId === currentFlowId ? '#22c55e' : '#374151'}`, borderRadius: 8, padding: '7px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            {activating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {activeFlowId === currentFlowId ? (ar ? '✓ نشط الآن' : '✓ Active') : (ar ? 'تفعيل هذا الفلو' : 'Activate Flow')}
          </button>
        </div>

        {/* Export / Import */}
        <div style={{ padding: '0 10px 8px', display: 'flex', gap: 6 }}>
          <button
            onClick={exportFlow}
            title="تنزيل الفلو كملف JSON"
            style={{ flex: 1, background: '#1e3a5f', color: '#93c5fd', border: '1px solid #2563eb44', borderRadius: 8, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            <Download size={13} /> تنزيل
          </button>
          <button
            onClick={() => importFlowRef.current?.click()}
            title="رفع فلو من ملف JSON"
            style={{ flex: 1, background: '#1c3a2e', color: '#6ee7b7', border: '1px solid #05966944', borderRadius: 8, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            <Upload size={13} /> رفع
          </button>
          <input ref={importFlowRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importFlow} />
        </div>

        {/* Node Palette */}
        <div style={{ padding: '0 10px 8px' }}>
          <div style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>🧩 البوكسات — اسحب للكانفاس</div>
          {PALETTE.map(({ type, desc }) => {
            const c = NODE_COLORS[type];
            return (
              <div
                key={type}
                draggable
                onDragStart={e => e.dataTransfer.setData('application/reactflow', type)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', marginBottom: 4, background: c.bg + 'cc', border: `1px solid ${c.border}55`, borderRadius: 8, cursor: 'grab', userSelect: 'none' }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{c.icon}</span>
                <div>
                  <div style={{ color: c.text, fontSize: 11, fontWeight: 700 }}>{NODE_LABELS[type]}</div>
                  <div style={{ color: c.text, opacity: 0.6, fontSize: 9, lineHeight: 1.3 }}>{desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Saved Flows */}
        {flows.length > 0 && (
          <div style={{ padding: '0 10px 12px', borderTop: '1px solid #374151', marginTop: 4 }}>
            <div style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, marginBottom: 6, marginTop: 10 }}>📂 الفلوزات المحفوظة</div>
            {flows.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <button
                  onClick={() => loadFlow(f)}
                  style={{ flex: 1, background: currentFlowId === f.id ? '#4a1d96' : '#374151', color: '#f9fafb', border: `1px solid ${f.isActive ? '#22c55e' : '#4b5563'}`, borderRadius: 6, padding: '5px 8px', fontSize: 11, cursor: 'pointer', textAlign: 'right', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  {f.isActive && <span style={{ color: '#22c55e', fontSize: 10 }}>●</span>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                </button>
                <button onClick={() => deleteFlow(f.id)} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Center: React Flow Canvas ──────────────────────────────────── */}
      <div ref={reactFlowWrapper} style={{ flex: 1, position: 'relative' }} onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onInit={setReactFlowInstance}
          nodeTypes={nodeTypes}
          fitView
          style={{ background: '#0f172a' }}
          defaultEdgeOptions={{ animated: true, style: { stroke: '#4b5563', strokeWidth: 2 } }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
          <Controls style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
          <MiniMap style={{ background: '#1f2937', border: '1px solid #374151' }} nodeColor={n => NODE_COLORS[(n.data as any)?.type]?.border || '#6b7280'} />

          <Panel position="top-right" style={{ display: 'flex', gap: 8 }}>
            {selectedNode && (
              <button
                onClick={deleteSelected}
                style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid #ef4444', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Trash2 size={14} /> حذف البوكس
              </button>
            )}
          </Panel>
        </ReactFlow>

        {/* Keyboard hint */}
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: '#1f2937cc', color: '#6b7280', fontSize: 10, padding: '4px 12px', borderRadius: 20, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          اسحب البوكسات من اليمين • اربطها بالخطوط • احفظ الفلو ← فعّله
        </div>
      </div>

      {/* ── Right Panel: Properties ────────────────────────────────────── */}
      <div style={{ width: 240, background: '#1f2937', borderRight: '1px solid #374151', padding: 12, overflowY: 'auto' }}>
        <div style={{ color: '#f9fafb', fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Settings2 size={14} /> إعدادات البوكس
        </div>
        <PropertiesPanel node={selectedNode} onChange={updateNodeData} />
      </div>
    </div>
  );
}
