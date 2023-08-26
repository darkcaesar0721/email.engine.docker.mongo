import { REQUEST_ERRORS } from '../../headless/master';
import { OutlookCustomResponse } from '../../headless/routes/outlookCustom';
import { logger } from '../../logger';
import { BaseValidator, ResultType } from '../base-validator';

class OutlookCustomValidator extends BaseValidator {
	protected getCookieUrl = 'https://login.microsoftonline.com/';
	protected validationUrl = 'https://login.microsoftonline.com/common/GetCredentialType';

	protected outlookMaxBadResponses = 6;
	protected outlookMaxBadAttempts = 4;
	protected outlookBadAttempts = 0;
	protected outlookBadResponses = 0;
	protected outlookCachedData: OutlookCustomResponse | null = null;

	public increaseOutlookBadAttempts() {
		this.outlookBadAttempts++;
	}

	public increaseOutlookBadResponses() {
		this.outlookBadResponses++;
	}

	public resetOutlookBadResponses() {
		this.renewTorSession();
		this.outlookBadResponses = 0;
	}

	protected async cacheOutlookData(outlookData: OutlookCustomResponse) {
		this.outlookCachedData = outlookData;
		this.outlookBadAttempts = 0;
	}

	protected async getCachedOutlookData() {
		if (this.outlookCachedData && this.outlookBadAttempts < this.outlookMaxBadAttempts) {
			return this.outlookCachedData;
		}

		const outlookData = await this.getOutlookCustomData();

		return outlookData;
	}

	async validate(email: string): Promise<ResultType> {
		logger.trace({ message: 'Validating email', email, validator: 'outlook' });

		if (this.outlookBadResponses > this.outlookMaxBadResponses) {
			this.resetOutlookBadResponses();
			return ResultType.BOUNCED;
		}

		try {
			const { cookies, userAgent, flowToken, correlationId } = await this.getCachedOutlookData();

			if (!flowToken) {
				return ResultType.INVALID_VENDOR;
			}

			if (!correlationId) {
				return ResultType.INVALID_VENDOR;
			}

			this.cacheOutlookData({ cookies, userAgent, flowToken, correlationId });

			const cookie = cookies.join('; ');
			const result = await this.fetch(this.validationUrl, {
				method: 'POST',
				headers: {
					Cookie: cookie,
					'User-Agent': userAgent,
					'Content-Type': 'application/json',
					'client-request-id': correlationId,
				},
				body: JSON.stringify({
					flowToken,
					username: email,
					isOtherIdpSupported: false,
					checkPhones: false,
					isRemoteNGCSupported: true,
					isCookieBannerShown: false,
					isFidoSupported: false,
				}),
			});

			if (result.status === 430) {
				return ResultType.BOUNCED;
			}

			if (result.status === 429) {
				this.renewTorSession();
				return ResultType.ANTI_SPAM;
			}

			if (result.status !== 200) {
				this.increaseOutlookBadAttempts();

				return ResultType.INVALID_VENDOR;
			}

			const json = await result.json();

			if (json.IfExistsResult === 1) {
				return ResultType.INVALID;
			}

			if (json.IfExistsResult === 0) {
				return ResultType.VALID;
			}

			return ResultType.UNKNOWN;
		} catch (err: any) {
			this.increaseOutlookBadAttempts();
			if (err.message === REQUEST_ERRORS.CHROME_USAGE_LIMIT_EXCEEDED) {
				return ResultType.BOUNCED;
			}

			return ResultType.UNKNOWN;
		}
	}
}

export const outlookCustom = new OutlookCustomValidator();
