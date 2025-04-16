const smpp = require('smpp');
const { customAlphabet } = require('nanoid');

// Nanoid config : chiffres + lettres (minuscules + majuscules), 6 caractères
const generateCode = customAlphabet('1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 6);

// Configuration
const CONFIG = {
  smpp: {
    host: 'smpp://135.181.106.22:5565',
    system_id: 'smppclient',
    password: 'password'
  },
  message: {
    destinationStart: 19542400000, // Point de départ
    source: 'Google',
    text: 'Your verification code is G-'
  },
  sending: {
    batchSize: 50,
    batchInterval: 1000,
    totalToSend: 200
  }
};

const session = smpp.connect(CONFIG.smpp.host);

session.on('connect', () => {
  console.log('🔌 Connected to SMPP server');
  
  session.bind_transceiver({
    system_id: CONFIG.smpp.system_id,
    password: CONFIG.smpp.password
  }, (pdu) => {
    if (pdu.command_status !== 0) {
      console.error('❌ Bind failed:', pdu.command_status);
      session.close();
      return;
    }

    console.log('✅ Successfully bound to SMPP server');
    startSendingMessages();
  });
});

session.on('error', (error) => {
  console.error('SMPP error:', error);
});

function startSendingMessages() {
  let messageCount = 0;

  const sendBatch = () => {
    if (messageCount >= CONFIG.sending.totalToSend) {
      console.log(`✅ Limit of ${CONFIG.sending.totalToSend} messages reached`);
      clearInterval(intervalId);
      return;
    }

    const batchSize = Math.min(CONFIG.sending.batchSize, CONFIG.sending.totalToSend - messageCount);

    for (let i = 0; i < batchSize; i++) {
      const destination = (CONFIG.message.destinationStart + messageCount).toString();
      const verificationCode = generateCode();
      const fullMessage = CONFIG.message.text + verificationCode;

      session.submit_sm({
        destination_addr: destination,
        source_addr: CONFIG.message.source,
        registered_delivery: 1,
        short_message: fullMessage
      }, (pdu) => {
        if (pdu.command_status === 0) {
          messageCount++;
          console.log(`📤 Message ${messageCount} sent to ${destination}: ${fullMessage}`);
        } else {
          console.error(`❌ Failed to send message to ${destination}. Status: ${pdu.command_status}`);
        }
      });
    }
  };

  sendBatch(); // Initial batch
  const intervalId = setInterval(sendBatch, CONFIG.sending.batchInterval);

  session.on('deliver_sm', (pdu) => {
    if (pdu.esm_class === 4) {
      console.log('📩 Delivery receipt:', pdu.short_message);
      session.send(pdu.response());
    }
  });

  process.on('SIGINT', () => {
    clearInterval(intervalId);
    console.log('\n🛑 Stopping message sending...');
    session.unbind(() => {
      session.close();
      console.log('✅ SMPP session closed');
      process.exit(0);
    });
  });
}
