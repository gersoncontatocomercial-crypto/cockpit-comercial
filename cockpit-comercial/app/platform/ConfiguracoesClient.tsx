// Modifications to the Configurações page
import React from 'react';

const ConfiguracoesClient = () => {
    // Your current component code...
    return (
        <div>
            <h1>Configurações</h1>
            {/* Check if the user is admin */}
            {userRole === 'admin' && (
                <div>
                    <h2>Usuários</h2>
                    {/* Embedded user list and role editor */}
                </div>
            )}
            {/* Other settings components */}
        </div>
    );
};

export default ConfiguracoesClient;