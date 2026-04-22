import React, { useRef, useState } from 'react';
import { API_BASE } from '../apiConfig';

interface MediaItem {
  id: string;
  url: string;
  file: File;
}

export default function PromptUploader({ token }: { token: string | null }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!token) {
      alert("请先登录再上传素材！");
      return;
    }
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const images = files.filter(f => f.type.startsWith('image/'));
    
    if (files.length !== images.length) {
      alert("⚠️ 视觉反推目前仅支持上传静态图片（JPG/PNG/WEBP），已自动过滤视频文件！");
    }

    if (images.length > 20) {
      alert("❌ 批量上传受限：单次图片解析最高支持 20 张！");
      return;
    }

    const newItems: MediaItem[] = images.map((file) => ({
       id: Math.random().toString(36).substr(2, 9),
       url: URL.createObjectURL(file),
       file: file,
    }));

    setMediaList(newItems);
  };

  const triggerUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleSubmit = async () => {
    if (!mediaList.length) return;
    if (!token) return alert("请先登录账户");
    
    const formData = new FormData();
    mediaList.forEach((item, index) => {
         formData.append(`media_${index}`, item.file);
         formData.append(`type_${index}`, 'prompt');
    });

    try {
        const res = await fetch(`${API_BASE}/api/tasks/prompt/batch`, {
             method: 'POST',
             headers: { 'Authorization': `Bearer ${token}` },
             body: formData
        });
        const data = await res.json();
        if(data.success) {
            alert(`✅ 批量解析指令已下发！队列系统已接收 ${mediaList.length} 个任务。\n预扣除总计 ${totalCost} Credits。`);
            setMediaList([]); 
            if(window.refreshTasks) window.refreshTasks(); 
        } else {
            alert("❌ 队列下卷失败：" + (data.error || "未知错误"));
        }
    } catch (err) {
        alert("❌ 网关通信失败流产，请确认 api-server 是否开启在 3000 端口！");
    }
  };

  const totalCost = mediaList.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <input 
        type="file" 
        multiple
        accept="image/*" 
        onChange={handleFileUpload} 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
      />

      {mediaList.length === 0 ? (
        <div 
          onClick={triggerUpload}
          style={{ 
            border: '2px dashed var(--border-color)', borderRadius: 'var(--border-radius)', 
            padding: '4rem 2rem', background: 'rgba(0,0,0,0.2)', width: '100%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
            transition: 'background 0.3s'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.2)'}
        >
           <h3 style={{ margin: '0 0 1rem 0' }}>点击或拖拽批量上传需要反推的图片</h3>
           <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>VLM 将深度解析画派风格、情绪及光影参数 (批量上限: 20张)</p>
        </div>
      ) : (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '750px', marginBottom: '0.5rem' }}>
             <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                当前选择: 🖼️ {mediaList.length} 张图片
             </span>
             <span style={{ fontSize: '0.85rem', color: 'var(--accent-secondary)' }}>
                ⚠️ 预估全组算力消耗: {totalCost} Credits
             </span>
          </div>

          {/* 漂亮的毛玻璃预览框（取第一张展示大图） */}
          <div style={{ 
              width: '100%', maxWidth: '750px', 
              border: '1px solid var(--border-color)', borderRadius: '8px', 
              overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center'
            }}>
            <img src={mediaList[0].url} alt="VLM Preview" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }} />
          </div>
          
          {/* 缩略图滑轨阵列 */}
          {mediaList.length > 1 && (
            <div style={{
               display: 'flex', gap: '0.8rem', overflowX: 'auto', width: '100%', maxWidth: '750px', 
               padding: '1rem 0', marginTop: '0.5rem',
               scrollbarWidth: 'thin', scrollbarColor: 'var(--accent-primary) var(--bg-surface)'
            }}>
               {mediaList.map((item, index) => (
                  <div 
                    key={item.id}
                    style={{ 
                       flexShrink: 0, width: '60px', height: '60px', 
                       border: index === 0 ? '2px solid var(--accent-primary)' : '2px solid transparent',
                       borderRadius: '6px', overflow: 'hidden', position: 'relative',
                       background: 'rgba(0,0,0,0.5)'
                    }}>
                    <img src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
               ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'center' }}>
             <button 
                onClick={triggerUpload} 
                style={{ background: 'transparent', color: '#ec4899', border: '1px dashed #ec4899', padding: '0.75rem 1.5rem', borderRadius: '9999px', cursor: 'pointer' }}>
                添加/更换图片
             </button>
          </div>

          {/* 主执行按钮 */}
          <div style={{ height: '70px', marginTop: '1.5rem', width: '100%', maxWidth: '750px' }}>
               <button 
                 onClick={handleSubmit}
                 style={{ 
                   width: '100%',
                   background: 'linear-gradient(90deg, #8b5cf6, #ec4899)', 
                   color: 'white', border: '2px solid rgba(255,255,255,0.2)', padding: '1rem 1.5rem', 
                   borderRadius: '12px', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold',
                   boxShadow: '0 8px 30px rgba(139, 92, 246, 0.4)',
                   animation: 'fadeIn 0.3s ease-in'
                 }}>
                 🧠 启动批量 AI 反推 ({mediaList.length} 份任务)
               </button>
          </div>

        </div>
      )}
    </div>
  );
}
