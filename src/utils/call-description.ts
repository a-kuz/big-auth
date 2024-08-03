import { CallOnMessage } from "~/types/ChatMessage";

export const callDesription = (call: CallOnMessage) => {
    return `${call.status === 'missed' ?
            call.direction == 'incoming' ?
                '☎️ Missed' :
                'Canceled'
            :
            call.direction == 'incoming' ?
                '📲 Incoming' :
                'Outgoing'
        } ${call.callType == 'video' ?
            'video' :
            ''} Call`
}
