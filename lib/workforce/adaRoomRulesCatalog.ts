import { ADA_ROOM_RULES_EFFECTIVE_DATE } from './adaRoomRulebook'

/**
 * Text faithfully organized from the ADA livestream room regulation,
 * issued 2026-10-21, effective 2026-10-22, sections I–VI.
 * Monetary figures represent the DOCUMENT'S proposed rules, not legal salary deductions.
 */
export interface AdaRoomRulesSection {
  id: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI'
  title: string
  items: readonly { title: string; details: readonly string[] }[]
}

export const ADA_ROOM_RULES_CATALOG: readonly AdaRoomRulesSection[] = [
  {
    id: 'I', title: 'Quy định chung áp dụng cho tất cả nhân sự',
    items: [
      { title: 'Phòng livestream & tài sản', details: [
        'Không mang nước mía vào khu vực livestream.',
        'Không tự ý thay đổi layout, ánh sáng, camera, props nếu chưa được kỹ thuật đồng ý.',
        'Không mời người ngoài, người không có ca trực vào phòng; không tự vào phòng live khác ca khi chưa được phép.',
        'Dọn rác cá nhân, giữ vệ sinh và trả sample, props về đúng vị trí trước khi rời phòng.',
      ]},
      { title: 'Hành vi và bảo mật', details: [
        'Không sử dụng điện thoại cho việc cá nhân trong giờ live, ngoại trừ việc liên quan trực tiếp đến phiên live.',
        'Bảo mật thông tin ADA, brand, doanh thu và các chương trình khuyến mãi.',
      ]},
      { title: 'Xử lý theo văn bản', details: [
        'Vi phạm quy định chung: văn bản ghi 100.000đ/lần.',
        'Hư hại thiết bị, props hoặc sample: văn bản yêu cầu bồi thường theo giá trị thiệt hại thực tế.',
        'Lộ bí mật: văn bản đề nghị chấm dứt hợp tác và bồi thường thiệt hại thực tế; phải qua xác minh, rà soát hợp đồng và pháp lý.',
      ]},
    ],
  },
  {
    id: 'II', title: 'Giờ có mặt, check-in, check-out và outfit',
    items: [
      { title: 'Giờ có mặt bắt buộc', details: [
        'Host: trước giờ live ít nhất 15 phút; Trợ live: trước giờ live ít nhất 30 phút, áp dụng cho Daily và Campaign.',
        'Mốc giờ có mặt bắt buộc là mốc tính trễ, KHÔNG phải thời gian bắt đầu livestream.',
        'Campaign: ngày đôi, midmonth, payday, brand day, super brand day và ca được vận hành thông báo là Campaign khi xếp lịch.',
      ]},
      { title: 'Check-in trên group vận hành', details: [
        'Ngay khi có mặt và trước mốc bắt buộc, gửi “Check-in – [Tên] – [Host/Trợ] – [Brand + TTS/SHP] – [Giờ live]”.',
        'Gửi 01 ảnh toàn thân outfit tại phòng live theo brand guideline.',
        'Timestamp tin nhắn trên group là căn cứ duy nhất để xác định giờ có mặt theo nội quy. Có mặt nhưng chưa gửi tin được xem như chưa có mặt theo nội quy.',
        'Outfit sai phải khắc phục trước giờ live khi team vận hành yêu cầu.',
      ]},
      { title: 'Check-out và nghiệm thu', details: [
        'Trong 15 phút sau khi live kết thúc, gửi “Check-out – [Tên] – [Brand] – [Giờ kết thúc]”.',
        'Trợ live phải gửi dashboard, visibility và tải hình lên Drive.',
        'Dọn phòng và trả sample/props trước khi check-out.',
      ]},
      { title: 'Mức đề xuất Mục II', details: [
        'Không check-in HOẶC thiếu ảnh outfit: 100.000đ/lần cho Host và Trợ.',
        'Không check-out HOẶC thiếu recap/hình ảnh report: 100.000đ/lần cho Host và Trợ.',
        'Outfit sai không chỉnh trước giờ live: 30% tiền ca.',
        'Các mức Mục II cộng với mức đi trễ nếu cùng ca có hai lỗi khác nhau; riêng Campaign nhân đôi mức Mục II.',
      ]},
    ],
  },
  {
    id: 'III', title: 'Host phòng livestream',
    items: [
      { title: 'Nhiệm vụ Host', details: [
        'Nắm thông tin sản phẩm, giá, khuyến mãi, flow live; tư vấn chính xác và trả lời khách.',
        'Recap insight khách hàng khi check-out.',
        'Kiểm tra layout, nội dung, sản phẩm, khuyến mãi để đảm bảo live air đúng giờ; outfit đúng guideline.',
        'Tác phong tích cực, không làm việc riêng gây khoảng lặng; văn bản ghi mức 30% tiền ca nếu vi phạm và ảnh hưởng hình ảnh brand.',
      ]},
      { title: 'Host: thang đi trễ', details: [
        'Daily: trễ đến 5 phút = 10%; trên 5–15 phút = 30%; trên 15–30 phút = 50%; trên 30 phút hoặc air trễ = 100% tiền ca.',
        'Campaign: trễ đến 5 phút = 20%; trên 5–15 phút = 50%; trên 15–30 phút = 100%; trên 30 phút hoặc air trễ = 100%.',
      ]},
      { title: 'Host: hủy, bỏ ca', details: [
        'Daily: hủy dưới 24 giờ, không có người thay = 300.000đ/ca; bỏ ca/không báo hoặc báo dưới 3 giờ = 1.000.000đ/ca.',
        'Campaign: cần báo trước tối thiểu 7 ngày; hủy trong 7 ngày không có pass hợp lệ = 600.000đ/ca; bỏ ca/không báo hoặc dưới 3 giờ = 2.000.000đ/ca.',
      ]},
    ],
  },
  {
    id: 'IV', title: 'Trợ livestream',
    items: [
      { title: 'Nhiệm vụ Trợ', details: [
        'Check-in đúng mốc để chuẩn bị sample, giỏ hàng và hệ thống livestream.',
        'Hô ứng với Host, đọc bình luận và hỗ trợ giải đáp; ghim sản phẩm, voucher, tung xu, minigame khi có yêu cầu.',
        'Hoàn tất sample, giỏ hàng, voucher và chuẩn bị hệ thống trước giờ live 10 phút.',
        'Recap dashboard, visibility, tải đủ ảnh lên Drive trước nghiệm thu. Quên ảnh phải báo trong ngày để được hỗ trợ lấy trước khi dữ liệu bị xóa; mất dữ liệu do không báo thì ca không được nghiệm thu theo văn bản.',
        'Giữ tác phong tích cực, không làm việc riêng gây khoảng lặng. Văn bản ghi 30% tiền ca nếu không tuân thủ.',
      ]},
      { title: 'Trợ: thang đi trễ', details: [
        'Daily: đến 5 phút = 15%; trên 5–15 phút = 30%; trên 15–30 phút = 50%; trên 30 phút hoặc air trễ = 100%.',
        'Campaign: đến 5 phút = 25%; trên 5–15 phút = 50%; trên 15–30 phút = 100%; trên 30 phút hoặc air trễ = 100%.',
      ]},
      { title: 'Trợ: hủy, bỏ ca', details: [
        'Daily: hủy dưới 24 giờ không có thay thế = 200.000đ; bỏ ca/không báo hoặc dưới 3 giờ = 500.000đ.',
        'Campaign: cần báo trước tối thiểu 7 ngày; hủy trong 7 ngày = 400.000đ; bỏ ca/không báo hoặc dưới 3 giờ = 1.000.000đ.',
      ]},
    ],
  },
  {
    id: 'V', title: 'Làm việc riêng, giám sát chéo và report',
    items: [
      { title: 'Các hành vi làm việc riêng', details: [
        'Nhắn tin, gọi điện, mạng xã hội, xem video hoặc chơi game vì việc riêng trong ca.',
        'Rời vị trí/phòng live khi chưa báo và chưa có đồng ý của vận hành hoặc kỹ thuật.',
        'Ăn uống, trang điểm, nói chuyện riêng khi on-air hoặc xuất hiện trong khung hình.',
        'Ngủ gật, lơ là bình luận, không phối hợp khiến phiên live có khoảng lặng.',
        'Làm việc cho brand hoặc đơn vị khác trong ca live ADA.',
      ]},
      { title: 'Thang tái phạm làm việc riêng (trong tháng)', details: [
        'Lần 1: Daily 30%, Campaign 50% tiền ca.',
        'Lần 2: Daily 50%, Campaign 100% tiền ca.',
        'Từ lần 3: 100% tiền ca và đề nghị ngưng lịch 1 tuần.',
        'Cùng một hành vi: mức làm việc riêng THAY THẾ mức vi phạm chung 100.000đ và mức 30% tác phong, KHÔNG cộng trùng.',
      ]},
      { title: 'Giám sát chéo và report', details: [
        'Host, Trợ và Kỹ thuật cùng ca giám sát và report có bằng chứng (ảnh, video, timecode live/camera).',
        'Gửi report RIÊNG cho vận hành trong 24 giờ sau ca, không lên group chung và không tranh cãi trong phiên live.',
        'Vận hành xác minh bằng video/camera và phản hồi trong 3 ngày làm việc. Bảo mật danh tính reporter.',
        'Kỹ thuật được report theo cùng quy trình nhưng xử lý theo quy định riêng của ADA.',
      ]},
      { title: 'Thưởng report và report sai', details: [
        'Report đúng, đã xác minh: văn bản ghi thưởng 50% khoản case, tối đa 70.000đ/case.',
        'Nhiều người report: chỉ người gửi hợp lệ ĐẦU TIÊN được tính thưởng.',
        'Bịa đặt hoặc cố tình gây mâu thuẫn: văn bản ghi 200.000đ/lần và tính 1 lỗi.',
        'Biết mà bao che: văn bản đề nghị mức xử lý tương đương người vi phạm, cần xác minh riêng.',
      ]},
    ],
  },
  {
    id: 'VI', title: 'Xử lý vi phạm, pass ca, bất khả kháng và thanh toán',
    items: [
      { title: 'Pass ca và bất khả kháng', details: [
        'Pass hợp lệ không bị coi là hủy nếu tự tìm được người thay phù hợp và được vận hành đồng ý chuyển giao.',
        'Campaign pass cần được đồng ý trước giờ live tối thiểu 24 giờ.',
        'Ốm có giấy, tai nạn, gia đình khẩn cấp, thiên tai...: báo ngay và bổ sung chứng cứ trong 48 giờ.',
      ]},
      { title: 'Ngưỡng tái phạm', details: [
        'Từ 3 lỗi trong 1 tháng: đề nghị ngưng xếp lịch 1 tuần.',
        'Đi trễ Campaign 2 lần/tháng: đề nghị không xếp Campaign tháng kế tiếp.',
        'Từ 5 lỗi trong 1 tháng hoặc bỏ ca không báo từ 2 lần: văn bản đề nghị chấm dứt hợp tác.',
      ]},
      { title: 'Đối soát và căn cứ pháp lý', details: [
        'Văn bản ghi tổng kết tiền phạt, thưởng report và điều chỉnh vào thù lao cuối tháng. Đây là nội dung gốc, không đồng nghĩa được phép khấu trừ lương.',
        'Trước khi ảnh hưởng khoản thanh toán cần phân loại hợp đồng, xác minh chứng cứ, đối chất, duyệt độc lập và rà soát pháp lý. Không tự động chuyển “đề xuất” thành khoản trừ.',
        'Ban hành 21/10/2026; hiệu lực '+ ADA_ROOM_RULES_EFFECTIVE_DATE +'. Có mục ký xác nhận của đại diện ADA và nhân sự.',
      ]},
    ],
  },
]
