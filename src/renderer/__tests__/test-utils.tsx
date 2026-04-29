import { ReactElement } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';

/**
 * 包裹 Router 的渲染工具函数
 * 所有页面组件测试都通过此函数渲染，确保 HashRouter 上下文可用
 */
export function renderWithProviders(ui: ReactElement) {
  return render(<HashRouter>{ui}</HashRouter>);
}

export { render, screen, waitFor, fireEvent };
