import React from 'react';
import './Loader.css';

const Loader = ({ label = 'Carregando...', size = 'md', inline = false, className = '' }) => {
  const sizeClass = size ? `loader--${size}` : '';
  const layoutClass = inline ? 'loader--inline' : 'loader--block';
  return (
    <div className={`loader-wrapper ${sizeClass} ${layoutClass} ${className}`.trim()}>
      <div className="simple-spinner"></div>
      {label ? <div className="loader-label fade-in-up-delay">{label}</div> : null}
    </div>
  );
};

export default Loader;
