'use client';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Typography,
  Box,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export interface TermsOfServiceDialogProps {
  /**
   * Whether the dialog is open
   */
  open: boolean;
  /**
   * Callback fired when the dialog should be closed
   */
  onClose: () => void;
}

interface TermContent {
  mainContent: string;
  subItems?: string[];
}

interface TermSection {
  title: string;
  contents: TermContent[];
}

const termSections: TermSection[] = [
  {
    title: '適用',
    contents: [
      {
        mainContent:
          '本規約は、なぎゆー（以下、「当方」といいます。）がこのウェブサイト上で提供するサービス（以下、「本サービス」といいます。）の利用条件を定めるものです。登録ユーザーの皆さま（以下、「ユーザー」といいます。）には、本規約に従って、本サービスをご利用いただきます。',
      },
    ],
  },
  {
    title: '利用登録',
    contents: [
      {
        mainContent:
          '本サービスにおいては、登録希望者が本規約に同意の上、当方の定める方法によって利用登録を申請し、当方がこれを承認することによって、利用登録が完了するものとします。',
      },
      {
        mainContent:
          '当方は、利用登録の申請者に以下の事由があると判断した場合、利用登録の申請を承認しないことがあり、その理由については一切の開示義務を負わないものとします。',
        subItems: [
          '利用登録の申請に際して虚偽の事項を届け出た場合',
          '本規約に違反したことがある者からの申請である場合',
          'その他、当方が利用登録を相当でないと判断した場合',
        ],
      },
    ],
  },
  {
    title: 'ユーザーIDおよびパスワードの管理',
    contents: [
      {
        mainContent:
          'ユーザーは、自己の責任において、本サービスのユーザーIDおよびパスワードを適切に管理するものとします。',
      },
      {
        mainContent:
          'ユーザーは、いかなる場合にも、ユーザーIDおよびパスワードを第三者に譲渡または貸与し、もしくは第三者と共用することはできません。当方は、ユーザーIDとパスワードの組み合わせが登録情報と一致してログインされた場合には、そのユーザーIDを登録しているユーザー自身による利用とみなします。',
      },
      {
        mainContent:
          'ユーザーID及びパスワードが第三者によって使用されたことによって生じた損害は、当方に故意又は重大な過失がある場合を除き、当方は一切の責任を負わないものとします。',
      },
    ],
  },
  {
    title: '利用料金および支払方法',
    contents: [
      {
        mainContent:
          'ユーザーは、本サービスの有料部分の対価として、当方が別途定め、本ウェブサイトに表示する利用料金を、当方が指定する方法により支払うものとします。',
      },
      {
        mainContent:
          'ユーザーが利用料金の支払を遅滞した場合には、ユーザーは年14．6％の割合による遅延損害金を支払うものとします。',
      },
    ],
  },
  {
    title: '禁止事項',
    contents: [
      {
        mainContent: 'ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。',
        subItems: [
          '法令または公序良俗に違反する行為',
          '犯罪行為に関連する行為',
          '本サービスの内容等、本サービスに含まれる著作権、商標権ほか知的財産権を侵害する行為',
          '当方、ほかのユーザー、またはその他第三者のサーバーまたはネットワークの機能を破壊したり、妨害したりする行為',
          '本サービスによって得られた情報を商業的に利用する行為',
          '当方のサービスの運営を妨害するおそれのある行為',
          '不正アクセスをし、またはこれを試みる行為',
          '他のユーザーに関する個人情報等を収集または蓄積する行為',
          '不正な目的を持って本サービスを利用する行為',
          '本サービスの他のユーザーまたはその他の第三者に不利益、損害、不快感を与える行為',
          '他のユーザーに成りすます行為',
          '当方が許諾しない本サービス上での宣伝、広告、勧誘、または営業行為',
          '面識のない異性との出会いを目的とした行為',
          '当方のサービスに関連して、反社会的勢力に対して直接または間接に利益を供与する行為',
          'その他、当方が不適切と判断する行為',
        ],
      },
    ],
  },
  {
    title: '本サービスの提供の停止等',
    contents: [
      {
        mainContent:
          '当方は、以下のいずれかの事由があると判断した場合、ユーザーに事前に通知することなく本サービスの全部または一部の提供を停止または中断することができるものとします。',
        subItems: [
          '本サービスにかかるコンピュータシステムの保守点検または更新を行う場合',
          '地震、落雷、火災、停電または天災などの不可抗力により、本サービスの提供が困難となった場合',
          'コンピュータまたは通信回線等が事故により停止した場合',
          'その他、当方が本サービスの提供が困難と判断した場合',
        ],
      },
      {
        mainContent:
          '当方は、本サービスの提供の停止または中断により、ユーザーまたは第三者が被ったいかなる不利益または損害についても、一切の責任を負わないものとします。',
      },
    ],
  },
  {
    title: '利用制限および登録抹消',
    contents: [
      {
        mainContent:
          '当方は、ユーザーが以下のいずれかに該当する場合には、事前の通知なく、ユーザーに対して、本サービスの全部もしくは一部の利用を制限し、またはユーザーとしての登録を抹消することができるものとします。',
        subItems: [
          '本規約のいずれかの条項に違反した場合',
          '登録事項に虚偽の事実があることが判明した場合',
          '料金等の支払債務の不履行があった場合',
          '当方からの連絡に対し、一定期間返答がない場合',
          '本サービスについて、最終の利用から一定期間利用がない場合',
          'その他、当方が本サービスの利用を適当でないと判断した場合',
        ],
      },
      {
        mainContent:
          '当方は、本条に基づき当方が行った行為によりユーザーに生じた損害について、一切の責任を負いません。',
      },
    ],
  },
  {
    title: '退会',
    contents: [
      {
        mainContent:
          'ユーザーは、当方の定める退会手続により、本サービスから退会できるものとします。',
      },
    ],
  },
  {
    title: '保証の否認および免責事項',
    contents: [
      {
        mainContent:
          '当方は、本サービスに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、有効性、特定の目的への適合性、セキュリティなどに関する欠陥、エラーやバグ、権利侵害などを含みます。）がないことを明示的にも黙示的にも保証しておりません。',
      },
      {
        mainContent:
          '当方は、本サービスに起因してユーザーに生じたあらゆる損害について、当方の故意又は重過失による場合を除き、一切の責任を負いません。ただし、本サービスに関する当方とユーザーとの間の契約（本規約を含みます。）が消費者契約法に定める消費者契約となる場合、この免責規定は適用されません。',
      },
      {
        mainContent:
          '前項ただし書に定める場合であっても、当方は、当方の過失（重過失を除きます。）による債務不履行または不法行為によりユーザーに生じた損害のうち特別な事情から生じた損害（当方またはユーザーが損害発生につき予見し、または予見し得た場合を含みます。）について一切の責任を負いません。また、当方の過失（重過失を除きます。）による債務不履行または不法行為によりユーザーに生じた損害の賠償は、ユーザーから当該損害が発生した月に受領した利用料の額を上限とします。',
      },
      {
        mainContent:
          '当方は、本サービスに関して、ユーザーと他のユーザーまたは第三者との間において生じた取引、連絡または紛争等について一切責任を負いません。',
      },
    ],
  },
  {
    title: 'サービス内容の変更等',
    contents: [
      {
        mainContent:
          '当方は、ユーザーへの事前の告知をもって、本サービスの内容を変更、追加または廃止することがあり、ユーザーはこれを承諾するものとします。',
      },
    ],
  },
  {
    title: '利用規約の変更',
    contents: [
      {
        mainContent:
          '当方は以下の場合には、ユーザーの個別の同意を要せず、本規約を変更することができるものとします。',
        subItems: [
          '本規約の変更がユーザーの一般の利益に適合するとき。',
          '本規約の変更が本サービス利用契約の目的に反せず、かつ、変更の必要性、変更後の内容の相当性その他の変更に係る事情に照らして合理的なものであるとき。',
        ],
      },
      {
        mainContent:
          '当方はユーザーに対し、前項による本規約の変更にあたり、事前に、本規約を変更する旨及び変更後の本規約の内容並びにその効力発生時期を通知します。',
      },
    ],
  },
  {
    title: '個人情報の取扱い',
    contents: [
      {
        mainContent:
          '当方は、本サービスの利用によって取得する個人情報については、当方「プライバシーポリシー」に従い適切に取り扱うものとします。',
      },
    ],
  },
  {
    title: '通知または連絡',
    contents: [
      {
        mainContent:
          'ユーザーと当方との間の通知または連絡は、当方の定める方法によって行うものとします。当方は、ユーザーから、当方が別途定める方式に従った変更届け出がない限り、現在登録されている連絡先が有効なものとみなして当該連絡先へ通知または連絡を行い、これらは、発信時にユーザーへ到達したものとみなします。',
      },
    ],
  },
  {
    title: '権利義務の譲渡の禁止',
    contents: [
      {
        mainContent:
          'ユーザーは、当方の書面による事前の承諾なく、利用契約上の地位または本規約に基づく権利もしくは義務を第三者に譲渡し、または担保に供することはできません。',
      },
    ],
  },
  {
    title: '準拠法・裁判管轄',
    contents: [
      {
        mainContent: '本規約の解釈にあたっては、日本法を準拠法とします。',
      },
      {
        mainContent:
          '本サービスに関して紛争が生じた場合には、当方の本店所在地を管轄する裁判所を専属的合意管轄とします。',
      },
    ],
  },
];

export default function TermsOfServiceDialog({ open, onClose }: TermsOfServiceDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pr: 1,
        }}
      >
        利用規約
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {termSections.map((section, sectionIndex) => (
          <Box key={sectionIndex} sx={{ mb: 4 }}>
            <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
              第{sectionIndex + 1}条（{section.title}）
            </Typography>
            {section.contents.map((content, contentIndex) => (
              <Box key={contentIndex} sx={{ mb: 2 }}>
                <Typography variant="body1" paragraph>
                  {content.mainContent}
                </Typography>
                {content.subItems && (
                  <Box component="ol" sx={{ pl: 3, mt: 1 }}>
                    {content.subItems.map((item, itemIndex) => (
                      <Box component="li" key={itemIndex} sx={{ mb: 1 }}>
                        <Typography variant="body2">{item}</Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        ))}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="contained" color="primary">
          閉じる
        </Button>
      </DialogActions>
    </Dialog>
  );
}
