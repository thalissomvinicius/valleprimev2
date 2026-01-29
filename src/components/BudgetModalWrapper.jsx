import React, { useState, useEffect } from 'react';
import BudgetModal from './BudgetModal';
import BudgetWizard from './BudgetWizard';

const BudgetModalWrapper = (props) => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Render wizard on mobile, traditional modal on desktop
    return isMobile ? <BudgetWizard {...props} /> : <BudgetModal {...props} />;
};

export default BudgetModalWrapper;
