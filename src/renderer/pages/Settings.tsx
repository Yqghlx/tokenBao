function Settings() {
  return (
    <div className="page">
      <h2>设置</h2>
      <div className="settings-form">
        <div className="form-group">
          <label>代理端口</label>
          <input type="number" defaultValue="8080" />
        </div>
        <div className="form-group">
          <label>数据保留天数</label>
          <input type="number" defaultValue="30" />
        </div>
        <div className="form-group">
          <label>缓存 TTL</label>
          <select defaultValue="5min">
            <option value="5min">5 分钟</option>
            <option value="1hour">1 小时</option>
          </select>
        </div>
        <button className="btn-primary">保存设置</button>
      </div>
    </div>
  );
}

export default Settings;