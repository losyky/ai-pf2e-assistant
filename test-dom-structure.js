// 检查神龛合成界面的 DOM 结构
console.log('=== 检查 DOM 结构 ===');

const shrineApp = Object.values(ui.windows).find(w => 
  w.title?.includes('神龛') || w.title?.includes('合成')
);

if (!shrineApp) {
  console.error('❌ 未找到神龛合成界面');
} else {
  console.log('✅ 找到神龛合成界面');
  
  const container = $(shrineApp.element).find('#circular-synthesis-container');
  console.log('\n容器信息:');
  console.log('- 容器数量:', container.length);
  console.log('- 容器 HTML (前200字符):', container.html()?.substring(0, 200));
  
  console.log('\n容器的直接子元素:');
  const children = container.children();
  console.log('- 子元素数量:', children.length);
  
  children.each((index, child) => {
    const $child = $(child);
    console.log(`\n${index + 1}. 标签: ${child.tagName}`);
    console.log(`   类名: ${child.className}`);
    console.log(`   位置: position=${$child.css('position')}, top=${$child.css('top')}, left=${$child.css('left')}`);
    console.log(`   尺寸: width=${$child.css('width')}, height=${$child.css('height')}`);
    console.log(`   z-index: ${$child.css('z-index')}`);
    
    if (child.tagName === 'svg') {
      console.log(`   SVG viewBox: ${child.getAttribute('viewBox')}`);
    }
    
    if ($child.hasClass('custom-shrine-background')) {
      console.log(`   ⭐ 这是自定义背景层`);
      console.log(`   背景图: ${$child.css('background-image')}`);
    }
  });
  
  console.log('\n容器的计算样式:');
  const containerStyle = window.getComputedStyle(container[0]);
  console.log('- display:', containerStyle.display);
  console.log('- justify-content:', containerStyle.justifyContent);
  console.log('- align-items:', containerStyle.alignItems);
  console.log('- width:', containerStyle.width);
  console.log('- height:', containerStyle.height);
}

console.log('\n=== 检查完成 ===');

