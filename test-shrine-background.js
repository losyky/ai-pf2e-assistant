// 详细的神龛背景测试脚本

console.log('=== 开始测试神龛背景图 ===');

// 1. 查找神龛合成界面
const shrineApp = Object.values(ui.windows).find(w => 
  w.constructor.name === 'ShrineSynthesisApp'
);

console.log('1. 神龛合成界面:', shrineApp ? '✅ 找到' : '❌ 未找到');

if (!shrineApp) {
  console.error('请先打开神龛合成界面');
} else {
  console.log('2. selectedShrine:', shrineApp.selectedShrine);
  
  if (!shrineApp.selectedShrine) {
    console.error('请先拖入一个神龛');
  } else {
    console.log('3. 神龛名称:', shrineApp.selectedShrine.name);
    console.log('4. originalItem:', shrineApp.selectedShrine.originalItem);
    
    if (!shrineApp.selectedShrine.originalItem) {
      console.error('❌ originalItem 不存在！这是问题所在！');
    } else {
      const shrine = shrineApp.selectedShrine.originalItem;
      console.log('5. ✅ originalItem 存在');
      console.log('6. 神龛完整数据:', shrine);
      
      const gmDesc = shrine.system?.description?.gm || '';
      console.log('7. GM描述长度:', gmDesc.length);
      console.log('8. GM描述内容（前500字符）:');
      console.log(gmDesc.substring(0, 500));
      
      const cleanText = gmDesc.replace(/<[^>]*>/g, '');
      console.log('9. 清理后的文本（前300字符）:');
      console.log(cleanText.substring(0, 300));
      
      const bgMatch = cleanText.match(/BACKGROUND_IMAGE:\s*([^\n]+)/i);
      console.log('10. 背景图匹配结果:', bgMatch);
      
      if (bgMatch && bgMatch[1]) {
        const bgUrl = bgMatch[1].trim();
        console.log('11. ✅ 找到背景图URL:', bgUrl);
        
        // 测试图片加载
        const testImg = new Image();
        testImg.src = bgUrl;
        testImg.onload = () => {
          console.log('12. ✅ 背景图加载成功，尺寸:', testImg.width, 'x', testImg.height);
        };
        testImg.onerror = () => {
          console.error('12. ❌ 背景图加载失败，路径可能有误:', bgUrl);
        };
        
        // 检查背景层
        const bgLayer = $(shrineApp.element).find('.custom-shrine-background');
        console.log('13. 背景层数量:', bgLayer.length);
        if (bgLayer.length > 0) {
          console.log('14. 背景层样式:', bgLayer.attr('style'));
          console.log('15. ✅ 背景层存在');
        } else {
          console.error('14. ❌ 背景层不存在！背景没有被应用！');
        }
      } else {
        console.error('11. ❌ 未找到 BACKGROUND_IMAGE 配置');
      }
    }
  }
}

console.log('=== 测试完成 ===');


