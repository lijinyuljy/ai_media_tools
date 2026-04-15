import React, { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';

interface Props {
  token: string | null;
  onMaskExtract: (rectParams: any) => void;
}

interface MediaItem {
  id: string;
  url: string;
  file: File;
  type: 'image' | 'video';
  maskCoords?: { x: number, y: number, width: number, height: number } | null;
}

export default function FabricMaskEditor({ token, onMaskExtract }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [videoEngine, setVideoEngine] = useState<'static' | 'dynamic'>('static');
  
  const isDrawingRef = useRef(false);
  const rectRef = useRef<fabric.Rect | null>(null);

  const activeMedia = mediaList[activeIndex] || null;
  const hasMask = !!activeMedia?.maskCoords;

  useEffect(() => {
    isDrawingRef.current = isDrawing;
    if (fabricRef.current) {
       fabricRef.current.defaultCursor = isDrawing ? 'crosshair' : 'default';
    }
  }, [isDrawing]);

  useEffect(() => {
    if (activeMedia && canvasRef.current) {
      if (fabricRef.current) {
         fabricRef.current.dispose();
         rectRef.current = null;
      }

      const canvas = new fabric.Canvas(canvasRef.current, {
        selection: false,
      });
      fabricRef.current = canvas;

      let isDragging = false;
      let originX = 0;
      let originY = 0;

      canvas.on('mouse:down', function(o) {
        if (!isDrawingRef.current) return;
        isDragging = true;
        
        var pointer = canvas.getPointer(o.e);
        originX = pointer.x;
        originY = pointer.y;

        const rect = new fabric.Rect({
          left: originX,
          top: originY,
          originX: 'left',
          originY: 'top',
          width: 0,
          height: 0,
          fill: 'rgba(139, 92, 246, 0.4)',
          stroke: '#ec4899',
          strokeWidth: 2,
          selectable: false, 
        });
        
        if (rectRef.current) {
           canvas.remove(rectRef.current);
        }
        
        canvas.add(rect);
        rectRef.current = rect;
        updateMaskCoords(null);
      });

      canvas.on('mouse:move', function(o) {
        if (!isDragging || !rectRef.current) return;
        var pointer = canvas.getPointer(o.e);
        
        if (originX > pointer.x) {
          rectRef.current.set({ left: Math.abs(pointer.x) });
        }
        if (originY > pointer.y) {
          rectRef.current.set({ top: Math.abs(pointer.y) });
        }
        
        rectRef.current.set({ width: Math.abs(originX - pointer.x) });
        rectRef.current.set({ height: Math.abs(originY - pointer.y) });
        canvas.renderAll();
      });

      canvas.on('mouse:up', function(o) {
        isDragging = false;
        if (rectRef.current && rectRef.current.width! > 5) {
          updateMaskCoords({
            x: rectRef.current.left!,
            y: rectRef.current.top!,
            width: rectRef.current.width!,
            height: rectRef.current.height!
          });
          setIsDrawing(false); 
        }
      });

      // 核心修复机制：分别处理图片与视频的加载挂载
      const injectMaskIfAny = () => {
         if (activeMedia.maskCoords && rectRef.current === null) {
            const savedRect = new fabric.Rect({
              left: activeMedia.maskCoords.x,
              top: activeMedia.maskCoords.y,
              width: activeMedia.maskCoords.width,
              height: activeMedia.maskCoords.height,
              fill: 'rgba(139, 92, 246, 0.4)',
              stroke: '#ec4899',
              strokeWidth: 2,
              selectable: false
            });
            canvas.add(savedRect);
            rectRef.current = savedRect;
         }
      };

      if (activeMedia.type === 'video') {
         const videoEl = document.createElement('video');
         videoEl.src = activeMedia.url;
         videoEl.muted = true;
         videoEl.playsInline = true;
         videoEl.crossOrigin = 'anonymous';

         const renderToFabric = () => {
             const vWidth = videoEl.videoWidth || 800;
             const vHeight = videoEl.videoHeight || 450;
             
             // 如果底图已经被装载了（比如被 seeked 事件触发过了），就不重复加载
             if (canvas.backgroundImage) return;

             // 稳妥方案：用原生 Canvas 抽出那一帧再传给 Fabric，不让 Fabric 直接吞视频元素
             const tempCanvas = document.createElement('canvas');
             tempCanvas.width = vWidth;
             tempCanvas.height = vHeight;
             const ctx = tempCanvas.getContext('2d');
             if (ctx) {
                 ctx.drawImage(videoEl, 0, 0, vWidth, vHeight);
                 const frameDataUrl = tempCanvas.toDataURL('image/jpeg');
                 
                 fabric.Image.fromURL(frameDataUrl, (img) => {
                     const maxWidth = 750;
                     const maxHeight = 450;
                     const scale = Math.min(maxWidth / (img.width || 1), maxHeight / (img.height || 1), 1); // 不拉伸小图，只缩小大图
                     
                     canvas.setWidth(img.width! * scale);
                     canvas.setHeight(img.height! * scale);
                     img.set({ originX: 'left', originY: 'top' });
                     img.scale(scale);
                     canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
                     injectMaskIfAny();
                 });
             }
         };

         videoEl.onloadeddata = () => {
             videoEl.currentTime = 0.5; // 跳转半秒确保跳过开头纯黑帧
         };
         
         videoEl.onseeked = renderToFabric;

         // 最后一道保险：万一由于未知原因不派发 seeked 事件，强行延时截取
         setTimeout(() => {
             if (videoEl.readyState >= 2) {
                 renderToFabric();
             }
         }, 800);

         videoEl.load();
      } else {
         const loadImg = new Image();
         loadImg.src = activeMedia.url;
         loadImg.onload = () => {
            const img = new fabric.Image(loadImg);
            const maxWidth = 750;
            const maxHeight = 450;
            const scale = Math.min(maxWidth / (img.width || 1), maxHeight / (img.height || 1), 1);
            
            canvas.setWidth(img.width! * scale);
            canvas.setHeight(img.height! * scale);
            img.scale(scale);
            canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
            injectMaskIfAny();
         };
      }
    }

    return () => {
      if (fabricRef.current && !activeMedia) {
         fabricRef.current.dispose();
         fabricRef.current = null;
      }
    }
  }, [activeIndex, activeMedia?.id]); 

  const updateMaskCoords = (coords: any) => {
    const newList = [...mediaList];
    if(newList[activeIndex]) {
       newList[activeIndex].maskCoords = coords;
       setMediaList(newList);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!token) {
      alert("请先登录再添加素材！");
      return;
    }
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const newItems: MediaItem[] = files.map((file) => ({
       id: Math.random().toString(36).substr(2, 9),
       url: URL.createObjectURL(file), // 给 video 和 img 标签做隐式 blob 直传
       file: file,
       type: file.type.startsWith('video/') ? 'video' : 'image',
       maskCoords: null
    }));

    setMediaList(prev => {
        const combined = [...prev, ...newItems]; // 修复：累加素材而不是替换
        let imgCount = combined.filter(i => i.type === 'image').length;
        let vidCount = combined.filter(i => i.type === 'video').length;
        
        if (imgCount > 20 || vidCount > 10) {
           alert("❌ 批量上传受限：单次图片最高 20 张，视频最高 10 个！超出的部分已被截断。");
           const keptImages = combined.filter(i => i.type === 'image').slice(0, 20);
           const keptVideos = combined.filter(i => i.type === 'video').slice(0, 10);
           return [...keptImages, ...keptVideos];
        }
        
        if (imgCount > 0 && vidCount > 0 && prev.length === 0) {
           alert("⚠️ 为了最佳队列稳定性，建议将图片与视频分开不同批次提交。");
        }
        
        return combined;
    });

    if (mediaList.length === 0) {
       setActiveIndex(0);
       setIsDrawing(false);
    }
    
    // Clear input so same file can be selected again
    if(fileInputRef.current) fileInputRef.current.value = "";
  };

  const triggerUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const clearSelection = () => {
    if (fabricRef.current && rectRef.current) {
       fabricRef.current.remove(rectRef.current);
       rectRef.current = null;
    }
    updateMaskCoords(null);
  };

  const clearAllMedia = () => {
    if(window.confirm("确定清空当前批次的所有媒体重新开始吗？")) {
       setMediaList([]);
       setActiveIndex(0);
    }
  }

  const applyMaskToAll = () => {
     const currentCoords = activeMedia?.maskCoords;
     if (!currentCoords) return;
     const newList = mediaList.map(item => ({
        ...item,
        maskCoords: { ...currentCoords }
     }));
     setMediaList(newList);
     alert(`🧲 继承成功！当前遮罩坐标已同步至全部 ${newList.length} 个媒体对象！`);
  };

  let totalCost = 0;
  mediaList.forEach(item => {
     if (item.type === 'image') totalCost += 1;
     if (item.type === 'video') {
         totalCost += (videoEngine === 'static' ? 5 : 25);
     }
  });

  const handleSubmit = async () => {
    const unmasked = mediaList.filter(i => !i.maskCoords);
    if (unmasked.length > 0) {
       if (!window.confirm(`队伍中还有 ${unmasked.length} 个媒体未绘制遮罩，它们将被跳过处理，继续提交吗？`)) return;
    }
    
    const targetFiles = mediaList.filter(i => i.maskCoords);
    if (!targetFiles.length) {
       alert("没有可以提交的处理项！请先框选目标区域。");
       return;
    }

    const formData = new FormData();
    targetFiles.forEach((item, index) => {
         formData.append(`media_${index}`, item.file);
         formData.append(`mask_${index}`, JSON.stringify(item.maskCoords));
         formData.append(`type_${index}`, item.type);
         formData.append(`engine_${index}`, videoEngine);
    });

    try {
        const res = await fetch('http://localhost:3000/api/tasks/watermark/batch', {
             method: 'POST',
             headers: { 'Authorization': `Bearer ${token}` },
             body: formData
        });
        const data = await res.json();
        if(data.success) {
            alert(`✅ 批量调度指令已下发！队列系统已接收 ${targetFiles.length} 个任务。\n预扣除总计 ${totalCost} Credits。请观察下方瀑布流状态更新！`);
            setMediaList([]); // 清空工作区
            if(window.refreshTasks) window.refreshTasks(); // 触发底部的队列刷新
        } else {
            alert("❌ 队列下推失败：" + data.error);
        }
    } catch (err) {
        alert("❌ 网关通信失败流产，请确认 api-server 是否开启在 3000 端口！");
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <input 
        type="file" 
        multiple
        accept="image/*, video/*" 
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
           <h3 style={{ margin: '0 0 1rem 0' }}>点击或拖拽批量上传需去水印的图片/短视频</h3>
           <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>支持 JPG, PNG, MP4 等格式</p>
           <p style={{ color: 'var(--accent-secondary)', fontSize: '0.9rem', fontWeight: 'bold', marginTop: '1rem' }}>支持多选批处理 (上限: 20图 / 10视频)</p>
        </div>
      ) : (
        <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '750px', marginBottom: '0.5rem', alignItems: 'center' }}>
             <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                批量组状态: 第 {activeIndex + 1} / {mediaList.length} 项 ({activeMedia.type === 'video' ? '🎬' : '🖼️'})
             </span>

             {activeMedia.type === 'video' && (
                <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.3rem', borderRadius: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: videoEngine === 'static' ? '#10b981' : '#888', cursor: 'pointer'}}>
                    <input type="radio" checked={videoEngine === 'static'} onChange={() => setVideoEngine('static')} style={{display: 'none'}} />
                    🔘 静态台标 (5 C/项)
                  </label>
                  <label style={{ fontSize: '0.8rem', color: videoEngine === 'dynamic' ? '#ec4899' : '#888', cursor: 'pointer'}}>
                    <input type="radio" checked={videoEngine === 'dynamic'} onChange={() => setVideoEngine('dynamic')} style={{display: 'none'}} />
                    🔥 AI追踪 (25 C/项)
                  </label>
                </div>
             )}

             <span style={{ fontSize: '0.85rem', color: 'var(--accent-secondary)' }}>
               ⚠️ 当前全组总计口径: {totalCost} Credits
             </span>
          </div>

          <div style={{ position: 'relative', width: '100%', maxWidth: '750px' }}>
             <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <canvas ref={canvasRef} />
             </div>
             <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.5)', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.7rem', color: '#fff', pointerEvents: 'none' }}>
                状态: {isDrawing ? <span style={{color: '#10b981'}}>框选中...</span> : <span>预览查看</span>} 
                {videoEngine === 'dynamic' && activeMedia.type === 'video' && <span style={{color: '#ec4899', marginLeft: '5px'}}>[追踪准星锁定]</span>}
             </div>
          </div>
          
          {/* 缩略图滑轨阵列 Staging Strip （修复了视频缩略图黑屏的 Bug） */}
          {mediaList.length > 1 && (
            <div style={{
               display: 'flex', gap: '0.8rem', overflowX: 'auto', width: '100%', maxWidth: '750px', 
               padding: '1rem 0', marginTop: '0.5rem',
               scrollbarWidth: 'thin', scrollbarColor: 'var(--accent-primary) var(--bg-surface)'
            }}>
               {mediaList.map((item, index) => (
                  <div 
                    key={item.id}
                    onClick={() => { setActiveIndex(index); setIsDrawing(false); }}
                    style={{ 
                       flexShrink: 0, width: '80px', height: '60px', 
                       border: activeIndex === index ? '2px solid var(--accent-primary)' : '2px solid transparent',
                       borderRadius: '6px', overflow: 'hidden', cursor: 'pointer', position: 'relative',
                       background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center'
                    }}>
                    {/* 修复点：视频文件用 video 标签去渲染首帧，原图文件用 img 渲染 */}
                    {item.type === 'video' ? (
                       <video src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                    ) : (
                       <img src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    <div style={{ position: 'absolute', bottom: 2, right: 3, fontSize: '0.7rem' }}>
                       {item.maskCoords ? '✅' : ''}
                    </div>
                  </div>
               ))}
            </div>
          )}

          {/* 工具栏 */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'center' }}>
             <button className="btn-primary" onClick={() => setIsDrawing(!isDrawing)} style={{ background: isDrawing ? 'var(--btn-gradient)' : 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem 1.5rem', borderRadius: '9999px', cursor: 'pointer'}}>
                {isDrawing ? "🎯 绘制中 (点此取消)" : "⚡ 绘制目标区域"}
             </button>
             <button onClick={clearSelection} style={{ background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem 1.5rem', borderRadius: '9999px', cursor: 'pointer' }}>
                清除当前框选
             </button>
             <button 
                onClick={triggerUpload} 
                style={{ background: 'transparent', color: 'white', border: '1px dashed #4b5563', padding: '0.75rem 1.5rem', borderRadius: '9999px', cursor: 'pointer' }}>
                ➕ 添加素材
             </button>
             <button 
                onClick={clearAllMedia} 
                style={{ background: 'transparent', color: '#ef4444', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '9999px', cursor: 'pointer' }}>
                清空全组
             </button>
          </div>

          <div style={{ height: '70px', marginTop: '1.5rem', width: '100%', maxWidth: '750px', display: 'flex', gap: '1rem' }}>
             {/* 批量继承按钮功能始终可见（当文件>1时）以避免闪动，点击时自身校验 */}
             {mediaList.length > 1 && (
               <button 
                 onClick={applyMaskToAll}
                 style={{ 
                   flex: 1,
                   background: hasMask ? 'linear-gradient(135deg, #ec4899, #8b5cf6)' : 'rgba(255,255,255,0.05)', 
                   color: hasMask ? 'white' : '#666', border: 'none', padding: '1rem', 
                   borderRadius: '12px', cursor: hasMask ? 'pointer' : 'not-allowed', fontSize: '1rem', fontWeight: 'bold',
                   boxShadow: hasMask ? '0 4px 15px rgba(236, 72, 153, 0.3)' : 'none',
                   transition: 'all 0.3s'
                 }}>
                 🧲 同步坐标至全组 ({mediaList.length})
               </button>
             )}

             <button 
               onClick={handleSubmit}
               style={{ 
                 flex: mediaList.length > 1 ? 2 : 1,
                 background: 'linear-gradient(90deg, #10b981, #059669)', 
                 color: 'white', border: '2px solid rgba(255,255,255,0.2)', padding: '1rem 1.5rem', 
                 borderRadius: '12px', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold',
                 boxShadow: '0 8px 30px rgba(16, 185, 129, 0.3)',
                 animation: 'fadeIn 0.3s ease-in'
               }}>
               🚀 开始任务 (共 {mediaList.length} 项处理, 预估共消耗 {totalCost} Credits)
             </button>
          </div>

        </div>
      )}
    </div>
  );
}
