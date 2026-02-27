import React from 'react';
import './Loader.css';

import logo from '../assets/Valle-logo-azul.png';

const Loader = ({ label = 'Carregando...', size = 'md', inline = false, className = '' }) => {
  const sizeClass = size ? `loader--${size}` : '';
  const layoutClass = inline ? 'loader--inline' : 'loader--block';
  return (
    <div className={`loader-wrapper ${sizeClass} ${layoutClass} ${className}`.trim()}>
      <div className="loader-logo-container">
        <img src={logo} alt="Carregando" className="loader-logo pulse-animation" />
      </div>
      {label ? <div className="loader-label fade-in-up-delay">{label}</div> : null}
    </div>
  );
};

export default Loader;
