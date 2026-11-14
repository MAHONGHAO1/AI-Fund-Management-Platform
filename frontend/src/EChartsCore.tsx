import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

interface Props {
  option: object;
  style?: CSSProperties;
  label?: string;
  lazyUpdate?: boolean;
}

export default function EChartsCore({ option, style, label, lazyUpdate }: Props) {
  const elementRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const chart = init(element);
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // 用合并模式而不是 notMerge：每渲染都全量重绘会让曲线闪一下，也白扔掉 ECharts 的 diff。
  useEffect(() => {
    chartRef.current?.setOption(option as EChartsCoreOption, { lazyUpdate });
  }, [option, lazyUpdate]);

  return <div ref={elementRef} role="img" aria-label={label || '数据图表'} style={style} />;
}
