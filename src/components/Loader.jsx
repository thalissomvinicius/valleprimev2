import React from 'react';
import './Loader.css';

const Loader = ({ label = 'Carregando...', size = 'md', inline = false, className = '' }) => {
  const sizeClass = size ? `loader--${size}` : '';
  const layoutClass = inline ? 'loader--inline' : 'loader--block';
  return (
    <div className={`loader-wrapper ${sizeClass} ${layoutClass} ${className}`.trim()}>
      <div className="loader" aria-label={label} role="status">
        <div className="loader__balls">
          <div className="loader__balls__group">
            <div className="ball item1" />
            <div className="ball item1" />
            <div className="ball item1" />
          </div>
          <div className="loader__balls__group">
            <div className="ball item2" />
            <div className="ball item2" />
            <div className="ball item2" />
          </div>
          <div className="loader__balls__group">
            <div className="ball item3" />
            <div className="ball item3" />
            <div className="ball item3" />
          </div>
        </div>
      </div>
      {label ? <div className="loader-label">{label}</div> : null}
    </div>
  );
};

export default Loader;
